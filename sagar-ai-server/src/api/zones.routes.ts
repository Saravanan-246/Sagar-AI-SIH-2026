import { Router } from "express";
import { z } from "zod";

import { rankFishingZones } from "../services/ocean/zoneRanking";
import { asyncHandler } from "../middleware/validate";

const querySchema = z.object({
  query: z.string().optional(),
  recommendation: z.enum(["PREFER", "MONITOR", "AVOID"]).optional(),
});

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filters = querySchema.parse(req.query);

    let zones = rankFishingZones({ query: filters.query });

    if (filters.recommendation) {
      zones = zones.filter(
        (zone) => zone.recommendation === filters.recommendation
      );
    }

    res.json({ zones });
  })
);

export default router;
