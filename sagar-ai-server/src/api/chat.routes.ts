import { randomUUID } from "crypto";

import { Router } from "express";
import { z } from "zod";

import { runAgentOrchestrator } from "../services/agents/agentOrchestrator";
import {
  detectWhatIf,
  describeWhatIf,
  runWhatIf,
} from "../services/whatif/whatIfEngine";
import { calculateRouteOptions } from "../services/routes/routeService";
import { getMarineAreaByName, getMarineAreas } from "../services/marine/marineData";
import {
  classifyWithAi,
  type ConversationTurn,
} from "../services/ai/intentClassifier";
import { analyzeIntent, detectQueryLanguage } from "../services/ai/intent";
import { narrateResponse } from "../services/ai/responseNarrator";
import { buildDeterministicAnswer } from "../services/ai/fallbackNarrator";
import { isAiEnabled } from "../services/ai/openRouterClient";
import { asyncHandler } from "../middleware/validate";
import { buildAgentRequest, resolveArea } from "./shared";
import {
  shapeChatResponse,
  buildDataStatus,
  type ShapeChatResponseExtras,
  type StructuredSagarResponse,
} from "./responseShaper";

import type { ChatIntent, ChatLanguage } from "../types/chat";
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

type ExplicitRouteResult =
  | { kind: "none" }
  | { kind: "resolved"; route: RoutePlan | null }
  // The message named an explicit "from X to Y", but X and/or Y don't
  // match any configured marine area - never silently substitute the
  // default area here, that would render a fabricated route between
  // places Sagar has no real data for.
  | { kind: "unsupported"; from: string; to: string };

function resolveExplicitRoute(message: string): ExplicitRouteResult {
  const parsed = parseFromToRoute(message);

  if (!parsed) {
    return { kind: "none" };
  }

  // getMarineAreaByName (unlike resolveArea) returns undefined instead
  // of silently defaulting when nothing configured matches the name.
  const originArea = getMarineAreaByName(parsed.from);
  const destinationArea = getMarineAreaByName(parsed.to);

  if (!originArea || !destinationArea) {
    return { kind: "unsupported", from: parsed.from, to: parsed.to };
  }

  const options = calculateRouteOptions(
    originArea.coordinates,
    destinationArea.coordinates,
    { maxOptions: 1 }
  );

  return { kind: "resolved", route: options[0] ?? null };
}

const ROUTE_DECISION_PHRASE: Record<RoutePlan["routeDecision"], string> = {
  preferred: "This route is recommended",
  caution: "This route requires caution",
  avoid: "This route should be avoided",
  blocked: "This route is currently blocked",
};

/*
 * The reporting agent's situation/recommendation text is built from the
 * general area-wide risk assessment (weather/marine/alerts for wherever
 * the chat's context area happens to be) - it has no notion of a
 * specific resolved route and its own, usually very different, risk.
 * For a route intent, showing that generic area risk as "the answer"
 * is actively misleading (e.g. an 84/critical area alert score next to
 * a route whose whole point is a safe 18/low corridor that avoids that
 * exact hazard). Rebuild the answer directly from the resolved route's
 * own fields instead, so narration/fallback both explain the route
 * that was actually returned.
 */
function applyRouteAnswer(shaped: StructuredSagarResponse): void {
  const route = shaped.route;

  if (!route) {
    return;
  }

  shaped.riskLevel = route.risk.level;
  shaped.riskScore = route.risk.score;

  shaped.keyFactors = [
    route.reason,
    ...route.avoidedHazards.map((hazard) => `Avoids ${hazard}.`),
  ].filter((factor): factor is string => Boolean(factor && factor.trim()));

  shaped.situation = `${route.name} covers ${route.distanceKm.toFixed(1)} km with an estimated risk of ${route.risk.score}/100 (${route.risk.level}).`;

  shaped.recommendation = `${ROUTE_DECISION_PHRASE[route.routeDecision]} - ${route.reason}`;

  shaped.answer = `${shaped.situation} ${shaped.recommendation}`;
}

/*
 * A real "what if X" question can land on almost any keyword-matched
 * primary intent (e.g. a wind-increase what-if scores a tie against
 * "productivity" in the deterministic classifier and loses to it) even
 * though whatIfEngine has already computed the correct, specific
 * before/after comparison for it. When that comparison exists, it is a
 * much more direct answer to "what happens if...?" than whatever
 * unrelated intent's generic summary would otherwise be shown.
 */
function applyWhatIfAnswer(shaped: StructuredSagarResponse): void {
  const whatIf = shaped.whatIf;

  if (!whatIf) {
    return;
  }

  shaped.riskLevel = whatIf.after.riskLevel;
  shaped.riskScore = whatIf.after.riskScore;

  shaped.keyFactors = [
    `Current risk: ${whatIf.before.riskScore}/100 (${whatIf.before.riskLevel}).`,
    `If ${whatIf.question}: ${whatIf.after.riskScore}/100 (${whatIf.after.riskLevel}).`,
  ];

  shaped.situation = whatIf.impact;
  shaped.recommendation = whatIf.recommendation;
  shaped.answer = `${whatIf.impact} ${whatIf.recommendation}`.trim();
}

/*
 * pfz/alerts/marine_conditions intents already carry the right
 * structured data (zones, alerts, ocean evidence) but the reporting
 * agent's prose answer only ever reflects the generic area-wide risk
 * finding - so three genuinely different questions about the same
 * area can read as an identical answer. Each of these reuses fields
 * already present on the shaped response (no new data, no new call).
 */
function applyZoneAnswer(shaped: StructuredSagarResponse): void {
  const zones = shaped.zones;

  if (!zones || zones.length === 0) {
    return;
  }

  const best = zones.find((zone) => zone.recommendation === "PREFER") ?? zones[0];
  const area = shaped.affectedArea?.name;
  const reason = best.reasons[0];

  shaped.keyFactors = best.reasons.slice(0, 3);
  shaped.situation = `${best.name} looks like the best fishing zone right now${area ? ` near ${area}` : ""}.`;
  shaped.recommendation = reason ?? `This zone is currently rated "${best.recommendation}".`;
  shaped.answer = `${shaped.situation} ${shaped.recommendation}`.trim();
}

function applyAlertsAnswer(shaped: StructuredSagarResponse): void {
  const alerts = shaped.alerts;

  if (!alerts || alerts.length === 0) {
    return;
  }

  const severityOrder: Record<string, number> = { critical: 4, high: 3, moderate: 2, low: 1 };
  const top = [...alerts].sort(
    (a, b) => (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0)
  )[0];
  const area = shaped.affectedArea?.name;

  shaped.situation = `${alerts.length} active alert${alerts.length === 1 ? "" : "s"}${area ? ` near ${area}` : ""}, the most severe being "${top.title}" (${top.severity}).`;
  shaped.recommendation = top.recommendation;
  shaped.answer = `${shaped.situation} ${shaped.recommendation}`.trim();
}

function applyOceanAnswer(shaped: StructuredSagarResponse): void {
  const oceanEvidence = shaped.evidence?.find(
    (item) => item.type === "ocean" && item.summary
  );

  if (!oceanEvidence?.summary) {
    return;
  }

  const area = shaped.affectedArea?.name;

  shaped.situation = `${oceanEvidence.summary}${area ? ` (${area})` : ""}`;
  shaped.answer = shaped.situation;
}

const UNSUPPORTED_LOCATION_MESSAGE: Record<"en" | "ta" | "hi", (from: string, to: string) => string> = {
  en: (from, to) =>
    `${from} and ${to} are not currently available as configured route points in Sagar. Please select one of the available marine areas or route endpoints.`,
  ta: (from, to) =>
    `${from} மற்றும் ${to} தற்போது Sagar-இல் கட்டமைக்கப்பட்ட பாதை புள்ளிகளாக இல்லை. கிடைக்கும் கடல் பகுதிகளில் ஒன்றை தேர்ந்தெடுக்கவும்.`,
  hi: (from, to) =>
    `${from} और ${to} अभी Sagar में कॉन्फ़िगर किए गए रूट पॉइंट के रूप में उपलब्ध नहीं हैं। कृपया उपलब्ध समुद्री क्षेत्रों में से किसी एक को चुनें।`,
};

/*
 * ------------------------------------------------------------------
 * QUERY GATING
 * ------------------------------------------------------------------
 * Without this, ANY message - "bro", "what is the capital of India?",
 * a follow-up with no context - still flows through the full agent
 * pipeline, which always resolves SOME marine area (falling through
 * to the configured default, Thoothukudi Coast) and always runs the
 * risk/weather agents for it. That produces a confident-looking
 * "Combined risk score: 84/100... Thoothukudi Coast" answer for
 * questions that have nothing to do with Thoothukudi, or with marine
 * safety at all. This gate runs first and short-circuits those cases
 * before the pipeline (and its area-defaulting) ever runs, using only
 * the existing deterministic keyword/script classifier from
 * services/ai/intent.ts - no new AI call, no new dataset.
 */

// A short greeting/acknowledgement never needs marine data at all.
const CASUAL_PATTERN =
  /^(hi|hello|hey|yo|sup|bro|ok|okay|k|thanks|thank you|thx|good morning|good afternoon|good evening|bye|goodbye)[.!? ]*$/i;
const CASUAL_PATTERN_TA = /^(வணக்கம்|நன்றி|சரி)[.!?\s]*$/;
const CASUAL_PATTERN_HI = /^(नमस्ते|हाय|धन्यवाद|शुक्रिया|ठीक है)[.!?\s]*$/;

function isCasualMessage(message: string): boolean {
  const trimmed = message.trim();

  return (
    CASUAL_PATTERN.test(trimmed) ||
    CASUAL_PATTERN_TA.test(trimmed) ||
    CASUAL_PATTERN_HI.test(trimmed)
  );
}

// Intents that only mean something for a specific place - "is it
// safe?" or "ocean indicators?" with no place named anywhere is not
// answerable without guessing which of Sagar's configured areas the
// user meant.
const LOCATION_REQUIRED_INTENTS = new Set<ChatIntent>([
  "safety",
  "pfz",
  "marine_conditions",
  "tide",
  "geofence",
  "productivity",
]);

/** A configured marine area named (by full name or its first
 * significant word, e.g. "Thoothukudi" for "Thoothukudi Coast")
 * anywhere in the given text - used only to decide whether a location
 * was actually specified, never to invent one. */
function findMentionedArea(text: string) {
  const normalized = text.toLowerCase();

  return getMarineAreas().find((area) => {
    const nameLower = area.name.toLowerCase();

    if (normalized.includes(nameLower)) {
      return true;
    }

    return area.name
      .split(" ")
      .some((word) => word.length > 3 && normalized.includes(word.toLowerCase()));
  });
}

const CASUAL_REPLY: Record<ChatLanguage, string> = {
  en: "Hi - I'm Sagar. Ask me about marine safety, weather, ocean conditions, alerts, fishing zones or routes.",
  ta: "வணக்கம் - நான் சாகர். கடல் பாதுகாப்பு, வானிலை, கடல் நிலைகள், எச்சரிக்கைகள், மீன்பிடி பகுதிகள் அல்லது பாதைகள் பற்றி என்னிடம் கேளுங்கள்.",
  hi: "नमस्ते - मैं Sagar हूं। समुद्री सुरक्षा, मौसम, समुद्री स्थिति, चेतावनी, मछली पकड़ने के क्षेत्र या मार्गों के बारे में मुझसे पूछें।",
  te: "Hi - I'm Sagar. Ask me about marine safety, weather, ocean conditions, alerts, fishing zones or routes.",
  ml: "Hi - I'm Sagar. Ask me about marine safety, weather, ocean conditions, alerts, fishing zones or routes.",
  kn: "Hi - I'm Sagar. Ask me about marine safety, weather, ocean conditions, alerts, fishing zones or routes.",
};

const UNSUPPORTED_REPLY: Record<ChatLanguage, string> = {
  en: "That's outside Sagar's marine decision-support scope. I can help with marine safety, weather, ocean conditions, alerts, fishing zones, routes or what-if analysis.",
  ta: "இது சாகரின் கடல் முடிவு-துணை வரம்புக்கு வெளியே உள்ளது. கடல் பாதுகாப்பு, வானிலை, கடல் நிலைகள், எச்சரிக்கைகள், மீன்பிடி பகுதிகள், பாதைகள் அல்லது இதுவானால்-என்ன பகுப்பாய்வு குறித்து நான் உதவ முடியும்.",
  hi: "यह Sagar के समुद्री निर्णय-सहायता दायरे से बाहर है। मैं समुद्री सुरक्षा, मौसम, समुद्री स्थिति, चेतावनी, मछली पकड़ने के क्षेत्र, मार्ग या व्हाट-इफ विश्लेषण में मदद कर सकता हूं।",
  te: "That's outside Sagar's marine decision-support scope. I can help with marine safety, weather, ocean conditions, alerts, fishing zones, routes or what-if analysis.",
  ml: "That's outside Sagar's marine decision-support scope. I can help with marine safety, weather, ocean conditions, alerts, fishing zones, routes or what-if analysis.",
  kn: "That's outside Sagar's marine decision-support scope. I can help with marine safety, weather, ocean conditions, alerts, fishing zones, routes or what-if analysis.",
};

const LOCATION_CLARIFICATION: Record<ChatLanguage, string> = {
  en: "Which area would you like me to check?",
  ta: "நான் எந்த பகுதியை சரிபார்க்க வேண்டும்?",
  hi: "मुझे किस क्षेत्र की जांच करनी चाहिए?",
  te: "Which area would you like me to check?",
  ml: "Which area would you like me to check?",
  kn: "Which area would you like me to check?",
};

const ROUTE_CLARIFICATION: Record<ChatLanguage, string> = {
  en: "Which origin and destination should I use?",
  ta: "நான் எந்த தொடக்க இடம் மற்றும் இலக்கு இடத்தைப் பயன்படுத்த வேண்டும்?",
  hi: "मुझे कौन सा प्रारंभिक स्थान और गंतव्य उपयोग करना चाहिए?",
  te: "Which origin and destination should I use?",
  ml: "Which origin and destination should I use?",
  kn: "Which origin and destination should I use?",
};

function buildGateResponse(
  status: "unsupported" | "clarification_needed",
  intent: string,
  language: ChatLanguage,
  answer: string
): StructuredSagarResponse {
  return {
    requestId: randomUUID(),
    status,
    intent,
    language,
    answer,
    timestamp: new Date().toISOString(),
    dataStatus: buildDataStatus(),
  };
}

async function handleChat(input: ChatInput) {
  const history: ConversationTurn[] = input.history ?? [];

  const classification = isAiEnabled()
    ? await classifyWithAi(input.message, history).catch(() => null)
    : null;

  const gateLanguage: ChatLanguage = (input.language ??
    classification?.language ??
    detectQueryLanguage(input.message)) as ChatLanguage;

  // A configured area named in this message, or (failing that) in the
  // most recent user message from history - lets a genuine follow-up
  // ("what about tomorrow?" after "is it safe near Thoothukudi?")
  // still resolve correctly without an AI call, while a message that
  // never names anywhere stays ungrounded rather than silently
  // defaulting.
  const mentionedArea =
    findMentionedArea(input.message) ??
    [...history]
      .reverse()
      .map((turn) => (turn.role === "user" ? findMentionedArea(turn.text) : undefined))
      .find(Boolean);

  const deterministicIntent = analyzeIntent(input.message).intent;
  const effectiveIntent = (classification?.intent ?? deterministicIntent) as ChatIntent;

  const hasExplicitLocation = Boolean(
    input.areaId ||
      input.areaName ||
      classification?.areaHint ||
      (typeof input.latitude === "number" && typeof input.longitude === "number") ||
      mentionedArea
  );

  // A genuine "what if...?" hypothetical (detected the same way the
  // pipeline itself detects it below, independent of intent keyword
  // matching) is never truly location-ambiguous the way "is it safe?"
  // is - it reasonably applies to whatever area is already in context,
  // same as before this gate existed. Without this, "what happens if
  // wind increases?" would get blocked by the location-required check
  // below purely because its keyword-classified intent happens to be
  // "productivity" (a pre-existing classifier quirk), not because the
  // question is actually ambiguous.
  const isWhatIfQuery = Boolean(detectWhatIf(input.message) || classification?.isWhatIf);

  // Nothing in the message matched any known Sagar capability, and
  // there's no prior conversation to resolve it against - this is
  // either small talk or genuinely out of scope. Either way, never let
  // it fall through to the pipeline's default marine area.
  if (effectiveIntent === "general" && history.length === 0 && !isWhatIfQuery) {
    const reply = isCasualMessage(input.message)
      ? (CASUAL_REPLY[gateLanguage] ?? CASUAL_REPLY.en)
      : (UNSUPPORTED_REPLY[gateLanguage] ?? UNSUPPORTED_REPLY.en);

    return buildGateResponse("unsupported", "general", gateLanguage, reply);
  }

  // "Find the safest route." with no "from X to Y" and nothing else to
  // go on - ask rather than silently returning whatever the single
  // top-ranked route in the whole dataset happens to be.
  if (
    effectiveIntent === "route" &&
    !parseFromToRoute(input.message) &&
    !mentionedArea
  ) {
    return buildGateResponse(
      "clarification_needed",
      "route",
      gateLanguage,
      ROUTE_CLARIFICATION[gateLanguage] ?? ROUTE_CLARIFICATION.en
    );
  }

  // A location-specific question ("is it safe?", "ocean indicators?")
  // with no area named anywhere and none selected - ask instead of
  // silently defaulting to Thoothukudi Coast.
  if (
    LOCATION_REQUIRED_INTENTS.has(effectiveIntent) &&
    !hasExplicitLocation &&
    !isWhatIfQuery
  ) {
    return buildGateResponse(
      "clarification_needed",
      effectiveIntent,
      gateLanguage,
      LOCATION_CLARIFICATION[gateLanguage] ?? LOCATION_CLARIFICATION.en
    );
  }

  const areaId = input.areaId;
  const areaName = input.areaName ?? classification?.areaHint ?? mentionedArea?.name;
  // The client rarely sends an explicit language; fall back to what the
  // AI classifier detected from the message itself so the response's
  // `language` field (driving TTS locale on the client) reflects the
  // language actually used, not just a hardcoded default.
  const language = input.language ?? classification?.language;

  const baseRequest = buildAgentRequest({
    message: input.message,
    language,
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

  const explicitRoute = resolveExplicitRoute(input.message);

  const extras: ShapeChatResponseExtras = {
    secondaryIntents: classification?.secondaryIntents ?? [],
    resolvedRoute:
      explicitRoute.kind === "resolved"
        ? explicitRoute.route
        : explicitRoute.kind === "unsupported"
          ? null
          : undefined,
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

  const resolvedLanguage = (classification?.language ??
    (shaped.language as ChatLanguage) ??
    "en") as ChatLanguage;

  if (explicitRoute.kind === "unsupported") {
    // An explicit "from X to Y" request where X/Y aren't configured
    // route points - answer honestly instead of falling back to a
    // default area (which would render as a fabricated route). No
    // AI call needed here: nothing to narrate, the facts are just
    // "this isn't available".
    const messageBuilder =
      UNSUPPORTED_LOCATION_MESSAGE[
        resolvedLanguage === "ta" || resolvedLanguage === "hi"
          ? resolvedLanguage
          : "en"
      ];

    shaped.answer = messageBuilder(explicitRoute.from, explicitRoute.to);
    shaped.situation = shaped.answer;
    shaped.recommendation = undefined;
    shaped.riskLevel = undefined;
    shaped.riskScore = undefined;
    shaped.keyFactors = undefined;
    shaped.evidence = undefined;
    shaped.dataSources = undefined;
    shaped.affectedArea = null;

    return shaped;
  }

  // Trigger on the presence of an actually-resolved route, not just a
  // "route" primary intent label: resolveExplicitRoute runs on the raw
  // message text regardless of how the intent classifier labelled it
  // (e.g. "Is the route safe from X to Y?" classifies as "safety" but
  // still names a real route that should drive the answer).
  if (shaped.route) {
    applyRouteAnswer(shaped);
  }

  // Likewise, a real what-if comparison (detected independently via
  // whatIfEngine's own pattern match) should drive the answer whenever
  // it exists, regardless of which primary intent the keyword
  // classifier happened to land on for the rest of the sentence.
  if (shaped.whatIf) {
    applyWhatIfAnswer(shaped);
  } else if (shaped.intent === "pfz") {
    applyZoneAnswer(shaped);
  } else if (shaped.intent === "alerts") {
    applyAlertsAnswer(shaped);
  } else if (shaped.intent === "marine_conditions") {
    applyOceanAnswer(shaped);
  }

  let narrated: string | null = null;

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

    narrated = await narrateResponse({
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
      language: resolvedLanguage,
    }).catch(() => null);
  }

  if (narrated) {
    shaped.answer = narrated;
  } else {
    // OpenRouter unavailable (disabled, failed, out of credits) - the
    // existing deterministic answer is already correct and grounded,
    // but it's only ever composed in English. For Tamil/Hindi, swap
    // in a short template-based answer built from these same facts
    // (no AI call, no new values) so the visible reply actually
    // matches the language the user asked in.
    const localized = buildDeterministicAnswer(resolvedLanguage, {
      intent: shaped.intent,
      areaName: shaped.affectedArea?.name,
      riskLevel: shaped.riskLevel,
      riskScore: shaped.riskScore,
      route: shaped.route,
      zones: shaped.zones,
      alerts: shaped.alerts,
      whatIf: shaped.whatIf,
    });

    if (localized) {
      shaped.answer = localized;
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
