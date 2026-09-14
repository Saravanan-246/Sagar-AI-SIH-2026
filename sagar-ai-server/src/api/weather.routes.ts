import { Router } from "express";
import { z } from "zod";

import { runWeatherAgent } from "../services/agents/weatherAgent";
import { asyncHandler } from "../middleware/validate";
import { buildAgentRequest } from "./shared";

const querySchema = z.object({
  areaId: z.string().optional(),
  areaName: z.string().optional(),
});

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);
    const request = buildAgentRequest({
      ...query,
      intent: "marine_conditions",
    });

    const result = await runWeatherAgent(request);
    res.json(result);
  })
);

export default router;
