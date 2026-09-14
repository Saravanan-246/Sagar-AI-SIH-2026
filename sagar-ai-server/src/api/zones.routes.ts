import { Router } from "express";
import { z } from "zod";

import fishingZonesData from "../data/fishingZones.json";
import { asyncHandler } from "../middleware/validate";

interface FishingZoneRecord {
  id: string;
  name: string;
  region?: string;
  suitability?: string;
  chlorophyll?: number;
  sst?: number;
  fishSpecies?: string[];
  depthMeters?: number;
  coordinates?: unknown;
}

const zones: FishingZoneRecord[] = Array.isArray(fishingZonesData)
  ? (fishingZonesData as FishingZoneRecord[])
  : ((fishingZonesData as { zones?: FishingZoneRecord[] })?.zones ?? []);

const querySchema = z.object({
  query: z.string().optional(),
  suitability: z.string().optional(),
});

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filters = querySchema.parse(req.query);

    let results = zones;

    if (filters.query) {
      const text = filters.query.toLowerCase();
      results = results.filter(
        (zone) =>
          zone.name.toLowerCase().includes(text) ||
          (zone.region ?? "").toLowerCase().includes(text)
      );
    }

    if (filters.suitability) {
      const target = filters.suitability.toLowerCase();
      results = results.filter(
        (zone) => (zone.suitability ?? "").toLowerCase() === target
      );
    }

    res.json({ zones: results });
  })
);

export default router;
