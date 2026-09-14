import { Router } from "express";
import { z } from "zod";

import { runAgentOrchestrator } from "../services/agents/agentOrchestrator";
import {
  detectWhatIf,
  describeWhatIf,
  runWhatIf,
} from "../services/whatif/whatIfEngine";
import { asyncHandler } from "../middleware/validate";
import { buildAgentRequest, resolveArea } from "./shared";
import { shapeChatResponse, type WhatIfComparison } from "./responseShaper";

const languageEnum = z.enum(["en", "ta", "te", "ml", "kn", "hi"]);

const chatInputSchema = z.object({
  message: z.string().trim().min(1, "message is required"),
  language: languageEnum.optional(),
  areaId: z.string().optional(),
  areaName: z.string().optional(),
});

const router = Router();

async function handleChat(input: z.infer<typeof chatInputSchema>) {
  const baseRequest = buildAgentRequest({
    message: input.message,
    language: input.language,
    areaId: input.areaId,
    areaName: input.areaName,
  });

  const pipeline = await runAgentOrchestrator(baseRequest);

  let whatIf: WhatIfComparison | undefined;

  const detection = detectWhatIf(input.message);

  if (detection) {
    const area = resolveArea({
      areaId: input.areaId,
      areaName: input.areaName,
    });

    const riskFinding = pipeline.findings.find(
      (finding) =>
        finding.agent === "risk" &&
        finding.data &&
        typeof (finding.data as Record<string, unknown>)
          .riskScore === "number"
    );

    const riskData = riskFinding?.data as
      | { riskScore: number; riskLevel: string }
      | undefined;

    const before = {
      riskScore: riskData?.riskScore ?? area.safety.riskScore,
      riskLevel: riskData?.riskLevel ?? area.safety.overallRisk,
    };

    const scenarioResult = runWhatIf(detection, area.id);

    whatIf = {
      question: describeWhatIf(detection),
      before,
      after: {
        riskScore: scenarioResult.riskScore,
        riskLevel: scenarioResult.riskLevel,
        operability: scenarioResult.operability,
      },
      impact:
        scenarioResult.riskScore > before.riskScore
          ? `Risk increases from ${before.riskScore}/100 (${before.riskLevel}) to ${scenarioResult.riskScore}/100 (${scenarioResult.riskLevel}) if ${describeWhatIf(detection)}.`
          : `Risk changes from ${before.riskScore}/100 (${before.riskLevel}) to ${scenarioResult.riskScore}/100 (${scenarioResult.riskLevel}) if ${describeWhatIf(detection)}.`,
      recommendation: scenarioResult.recommendation,
    };
  }

  return shapeChatResponse(
    pipeline,
    { areaId: input.areaId, areaName: input.areaName },
    whatIf
  );
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
    });
    const result = await handleChat(input);
    res.json(result);
  })
);

export default router;
