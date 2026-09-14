import { Router } from "express";
import { z } from "zod";

import { runAgentOrchestrator } from "../services/agents/agentOrchestrator";
import {
  detectWhatIf,
  describeWhatIf,
  runWhatIf,
} from "../services/whatif/whatIfEngine";
import { calculateRouteOptions } from "../services/routes/routeService";
import {
  classifyWithAi,
  type ConversationTurn,
} from "../services/ai/intentClassifier";
import { narrateResponse } from "../services/ai/responseNarrator";
import { isAiEnabled } from "../services/ai/openRouterClient";
import { asyncHandler } from "../middleware/validate";
import { buildAgentRequest, resolveArea } from "./shared";
import {
  shapeChatResponse,
  type ShapeChatResponseExtras,
} from "./responseShaper";

import type { ChatLanguage } from "../types/chat";
import type { RoutePlan } from "../types/route";

const languageEnum = z.enum(["en", "ta", "te", "ml", "kn", "hi"]);

const historyTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(2000),
});

const chatInputSchema = z.object({
  message: z.string().trim().min(1, "message is required"),
  language: languageEnum.optional(),
  areaId: z.string().optional(),
  areaName: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  history: z.array(historyTurnSchema).max(8).optional(),
});

type ChatInput = z.infer<typeof chatInputSchema>;

const router = Router();

// Deterministic "safest route from A to B" parsing - cheap, no AI call needed.
const FROM_TO_PATTERN = /\bfrom\s+(.+?)\s+to\s+(.+?)(?:[.?!]|$)/i;

function parseFromToRoute(
  message: string
): { from: string; to: string } | null {
  const match = message.match(FROM_TO_PATTERN);

  if (!match) {
    return null;
  }

  const from = match[1].trim();
  const to = match[2].trim();

  return from && to ? { from, to } : null;
}

function resolveExplicitRoute(message: string): RoutePlan | null | undefined {
  const parsed = parseFromToRoute(message);

  if (!parsed) {
    return undefined;
  }

  const originArea = resolveArea({ areaName: parsed.from });
  const destinationArea = resolveArea({ areaName: parsed.to });

  const options = calculateRouteOptions(
    originArea.coordinates,
    destinationArea.coordinates,
    { maxOptions: 1 }
  );

  return options[0] ?? null;
}

async function handleChat(input: ChatInput) {
  const history: ConversationTurn[] = input.history ?? [];

  const classification = isAiEnabled()
    ? await classifyWithAi(input.message, history).catch(() => null)
    : null;

  const areaId = input.areaId;
  const areaName = input.areaName ?? classification?.areaHint;

  const baseRequest = buildAgentRequest({
    message: input.message,
    language: input.language,
    areaId,
    areaName,
    latitude: input.latitude,
    longitude: input.longitude,
  });

  if (classification?.intent) {
    baseRequest.parameters = {
      ...baseRequest.parameters,
      aiIntentHint: classification.intent,
    };
  }

  const pipeline = await runAgentOrchestrator(baseRequest);

  const extras: ShapeChatResponseExtras = {
    secondaryIntents: classification?.secondaryIntents ?? [],
    resolvedRoute: resolveExplicitRoute(input.message),
  };

  const whatIfDetection = detectWhatIf(input.message);

  if (whatIfDetection || classification?.isWhatIf) {
    const detection =
      whatIfDetection ??
      // AI flagged this as a what-if but couldn't be matched to a
      // specific deterministic kind - default to a wind-increase
      // scenario, the most common case, rather than guessing further.
      { kind: "wind_increase" as const, percent: 20 };

    const area = resolveArea({
      areaId,
      areaName,
      latitude: input.latitude,
      longitude: input.longitude,
    });

    const riskFinding = pipeline.findings.find(
      (finding) =>
        finding.agent === "risk" &&
        finding.data &&
        typeof (finding.data as Record<string, unknown>).riskScore ===
          "number"
    );

    const riskData = riskFinding?.data as
      | { riskScore: number; riskLevel: string }
      | undefined;

    const before = {
      riskScore: riskData?.riskScore ?? area.safety.riskScore,
      riskLevel: riskData?.riskLevel ?? area.safety.overallRisk,
    };

    const scenarioResult = runWhatIf(detection, area.id);
    const description = describeWhatIf(detection);

    extras.whatIf = {
      question: description,
      before,
      after: {
        riskScore: scenarioResult.riskScore,
        riskLevel: scenarioResult.riskLevel,
        operability: scenarioResult.operability,
      },
      impact: `Risk ${
        scenarioResult.riskScore > before.riskScore
          ? "increases"
          : "changes"
      } from ${before.riskScore}/100 (${before.riskLevel}) to ${scenarioResult.riskScore}/100 (${scenarioResult.riskLevel}) if ${description}.`,
      recommendation: scenarioResult.recommendation,
    };
  }

  const shaped = shapeChatResponse(
    pipeline,
    { areaId, areaName, latitude: input.latitude, longitude: input.longitude },
    extras
  );

  if (isAiEnabled()) {
    const routeSummary = shaped.route
      ? `${shaped.route.name}, ${shaped.route.distanceKm.toFixed(1)} km, risk ${shaped.route.risk.score}/100 (${shaped.route.risk.level}), ${shaped.route.routeDecision} - ${shaped.route.reason}`
      : undefined;

    const zonesSummary =
      shaped.zones && shaped.zones.length > 0
        ? shaped.zones
            .slice(0, 3)
            .map((zone) => `${zone.name} (${zone.recommendation})`)
            .join("; ")
        : undefined;

    const alertsSummary =
      shaped.alerts && shaped.alerts.length > 0
        ? shaped.alerts
            .slice(0, 3)
            .map((alert) => `${alert.title} (${alert.severity})`)
            .join("; ")
        : undefined;

    const whatIfSummary = shaped.whatIf
      ? `If ${shaped.whatIf.question}, ${shaped.whatIf.impact} ${shaped.whatIf.recommendation}`
      : undefined;

    const narrated = await narrateResponse({
      userQuestion: input.message,
      situation: shaped.situation,
      recommendation: shaped.recommendation,
      riskLevel: shaped.riskLevel,
      riskScore: shaped.riskScore,
      keyFactors: shaped.keyFactors,
      areaName: shaped.affectedArea?.name,
      routeSummary,
      zonesSummary,
      alertsSummary,
      whatIfSummary,
      language: (classification?.language ??
        (shaped.language as ChatLanguage) ??
        "en") as ChatLanguage,
    }).catch(() => null);

    if (narrated) {
      shaped.answer = narrated;
    }
  }

  return shaped;
}

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = chatInputSchema.parse(req.body);
    const result = await handleChat(input);
    res.json(result);
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const input = chatInputSchema.parse({
      message: req.query.message,
      language: req.query.language,
      areaId: req.query.areaId,
      areaName: req.query.areaName,
      latitude: req.query.latitude,
      longitude: req.query.longitude,
    });
    const result = await handleChat(input);
    res.json(result);
  })
);

export default router;
