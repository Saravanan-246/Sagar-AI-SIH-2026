import { Router } from "express";
import { z } from "zod";

import { runAgentOrchestrator } from "../services/agents/agentOrchestrator";
import { asyncHandler } from "../middleware/validate";
import { buildAgentRequest } from "./shared";

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

  return runAgentOrchestrator(baseRequest);
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
