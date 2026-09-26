import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../middleware/validate";
import { ApiError } from "../middleware/errorHandler";
import { DEFAULT_CONSTRAINTS } from "../services/decisions/decisionEngine";
import {
  acceptRepair,
  commitDecision,
  declineRepair,
  deleteDecision,
  getDecisionState,
  MAX_DECISION_NAME_LENGTH,
  renameDecision,
  resetDecisions,
  runLiveCycle,
  runReplayCycle,
} from "../services/decisions/decisionStore";

const commitSchema = z.object({
  routeId: z.string().min(1, "routeId is required"),
  name: z.string().max(MAX_DECISION_NAME_LENGTH).optional(),
  maxWaveHeightM: z.number().positive().max(10).optional(),
  maxWindKnots: z.number().positive().max(80).optional(),
});

const renameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Decision name can't be empty.")
    .max(MAX_DECISION_NAME_LENGTH, `Decision name must be ${MAX_DECISION_NAME_LENGTH} characters or fewer.`),
});

const cycleSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("live") }),
  z.object({ mode: z.literal("replay"), replayId: z.string().min(1) }),
]);

/** Domain errors (unknown id, route not bindable, ...) are the caller's
 * problem, not a server failure. */
function asClientError(error: unknown): never {
  throw new ApiError(400, error instanceof Error ? error.message : "Request failed.");
}

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await getDecisionState());
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = commitSchema.parse(req.body);
    const decision = await commitDecision(body.routeId, {
      maxWaveHeightM: body.maxWaveHeightM ?? DEFAULT_CONSTRAINTS.maxWaveHeightM,
      maxWindKnots: body.maxWindKnots ?? DEFAULT_CONSTRAINTS.maxWindKnots,
    }, body.name).catch(asClientError);
    res.status(201).json({ decision });
  })
);

router.post(
  "/cycle",
  asyncHandler(async (req, res) => {
    const body = cycleSchema.parse(req.body);
    const report = await (body.mode === "live" ? runLiveCycle() : runReplayCycle(body.replayId)).catch(
      asClientError
    );
    res.json({ report });
  })
);

router.post(
  "/:id/accept",
  asyncHandler(async (req, res) => {
    try {
      res.json({ decision: acceptRepair(req.params.id) });
    } catch (error) {
      asClientError(error);
    }
  })
);

router.post(
  "/:id/decline",
  asyncHandler(async (req, res) => {
    try {
      res.json({ decision: declineRepair(req.params.id) });
    } catch (error) {
      asClientError(error);
    }
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = renameSchema.parse(req.body);
    try {
      res.json({ decision: renameDecision(req.params.id, body.name) });
    } catch (error) {
      asClientError(error);
    }
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    try {
      deleteDecision(req.params.id);
      res.json({ deleted: req.params.id });
    } catch (error) {
      asClientError(error);
    }
  })
);

router.post(
  "/reset",
  asyncHandler(async (_req, res) => {
    resetDecisions();
    res.json(await getDecisionState());
  })
);

export default router;
