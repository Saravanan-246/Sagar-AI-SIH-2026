import { Router } from "express";
import { z } from "zod";

import { runMarineDataAgent } from "../services/agents/marineDataAgent";
import { runWeatherAgent } from "../services/agents/weatherAgent";
import { runGeoAgent } from "../services/agents/geoAgent";
import { runOceanAgent } from "../services/agents/oceanAgent";
import { runRiskAgent } from "../services/agents/riskAgent";
import type { AgentResponse } from "../services/agents/agentTypes";
import { asyncHandler } from "../middleware/validate";
import { buildAgentRequest } from "./shared";

const querySchema = z.object({
  areaId: z.string().optional(),
  areaName: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
});

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);

    const baseRequest = buildAgentRequest({
      areaId: query.areaId,
      areaName: query.areaName,
      intent: "safety",
    });

    if (
      typeof query.latitude === "number" &&
      typeof query.longitude === "number"
    ) {
      baseRequest.context.coordinates = {
        latitude: query.latitude,
        longitude: query.longitude,
      };
      baseRequest.parameters = {
        ...baseRequest.parameters,
        latitude: query.latitude,
        longitude: query.longitude,
        coordinates: {
          latitude: query.latitude,
          longitude: query.longitude,
        },
      };
    }

    const [marineData, weather, geo, ocean] = await Promise.all([
      runMarineDataAgent(baseRequest),
      runWeatherAgent(baseRequest),
      runGeoAgent(baseRequest),
      runOceanAgent(baseRequest),
    ]);

    const agentResponses: Record<string, AgentResponse> = {
      "marine-data": marineData,
      weather,
      geo,
      ocean,
    };

    const riskRequest = {
      ...baseRequest,
      previousFindings: [
        ...marineData.findings,
        ...weather.findings,
        ...geo.findings,
        ...ocean.findings,
      ],
      previousEvidence: [
        ...marineData.evidence,
        ...weather.evidence,
        ...geo.evidence,
        ...ocean.evidence,
      ],
      parameters: {
        ...baseRequest.parameters,
        agentResponses,
      },
    };

    const risk = await runRiskAgent(riskRequest);

    res.json({
      risk,
      inputs: { marineData, weather, geo, ocean },
    });
  })
);

export default router;
