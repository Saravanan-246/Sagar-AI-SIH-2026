import { Router } from "express";
import { z } from "zod";

import {
  calculateRoute,
  calculateRouteOptions,
  getRecommendedRoutes,
  getRouteById,
  getRoutes,
  getRoutesBetween,
  getSafestRoute,
  getShortestRoute,
} from "../services/routes/routeService";
import { asyncHandler } from "../middleware/validate";

const querySchema = z.object({
  id: z.string().optional(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  recommended: z.coerce.boolean().optional(),
  safest: z.coerce.boolean().optional(),
  shortest: z.coerce.boolean().optional(),
  originLat: z.coerce.number().optional(),
  originLng: z.coerce.number().optional(),
  destinationLat: z.coerce.number().optional(),
  destinationLng: z.coerce.number().optional(),
  maxOptions: z.coerce.number().min(1).max(5).optional(),
});

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);

    if (query.id) {
      const route = getRouteById(query.id);
      res.json({ route: route ?? null });
      return;
    }

    if (query.safest) {
      res.json({ route: getSafestRoute() ?? null });
      return;
    }

    if (query.shortest) {
      res.json({ route: getShortestRoute() ?? null });
      return;
    }

    if (query.origin && query.destination) {
      res.json({ routes: getRoutesBetween(query.origin, query.destination) });
      return;
    }

    if (
      typeof query.originLat === "number" &&
      typeof query.originLng === "number" &&
      typeof query.destinationLat === "number" &&
      typeof query.destinationLng === "number"
    ) {
      const origin = { latitude: query.originLat, longitude: query.originLng };
      const destination = {
        latitude: query.destinationLat,
        longitude: query.destinationLng,
      };

      const options = calculateRouteOptions(origin, destination, {
        maxOptions: query.maxOptions ?? 3,
      });

      res.json({
        route: options[0] ?? calculateRoute(origin, destination),
        routes: options,
      });
      return;
    }

    if (query.recommended) {
      res.json({ routes: getRecommendedRoutes() });
      return;
    }

    res.json({ routes: getRoutes() });
  })
);

export default router;
