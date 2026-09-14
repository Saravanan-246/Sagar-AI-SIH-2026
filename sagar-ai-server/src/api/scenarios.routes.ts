import { Router } from "express";
import { z } from "zod";

import {
  getScenarioById,
  getScenarios,
  runScenario,
} from "../services/scenarios/scenarioEngine";
import { asyncHandler } from "../middleware/validate";
import { ApiError } from "../middleware/errorHandler";

const listQuerySchema = z.object({
  id: z.string().optional(),
});

const runBodySchema = z.object({
  scenarioId: z.string().min(1, "scenarioId is required"),
  inputs: z.record(z.string(), z.unknown()).optional(),
});

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(req.query);

    if (query.id) {
      const scenario = getScenarioById(query.id);

      if (!scenario) {
        throw new ApiError(404, `Scenario "${query.id}" was not found.`);
      }

      res.json({ scenario });
      return;
    }

    res.json({ scenarios: getScenarios() });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = runBodySchema.parse(req.body);

    const scenario = getScenarioById(body.scenarioId);

    if (!scenario) {
      throw new ApiError(
        404,
        `Scenario "${body.scenarioId}" was not found.`
      );
    }

    const result = runScenario(scenario, body.inputs ?? {});
    res.json({ result });
  })
);

export default router;
