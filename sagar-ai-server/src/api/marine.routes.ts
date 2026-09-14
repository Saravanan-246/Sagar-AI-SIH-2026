import { Router } from "express";
import { z } from "zod";

import { getMarineAreas } from "../services/marine/marineData";
import { runMarineDataAgent } from "../services/agents/marineDataAgent";
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

    if (!query.areaId && !query.areaName) {
      res.json({ areas: getMarineAreas() });
      return;
    }

    const request = buildAgentRequest(query);
    const result = await runMarineDataAgent(request);
    res.json(result);
  })
);

export default router;
