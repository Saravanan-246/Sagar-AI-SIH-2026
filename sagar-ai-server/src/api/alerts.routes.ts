import { Router } from "express";
import { z } from "zod";

import {
  getAlerts,
  getAlertsByArea,
  getAlertsBySeverity,
  getAlertsByType,
} from "../services/alerts/alertService";
import { asyncHandler } from "../middleware/validate";

const querySchema = z.object({
  areaName: z.string().optional(),
  type: z.string().optional(),
  severity: z.string().optional(),
});

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);

    let alerts = getAlerts();

    if (query.areaName) {
      const areaFiltered = getAlertsByArea(query.areaName);
      alerts = alerts.filter((alert) =>
        areaFiltered.some((item) => item.id === alert.id)
      );
    }

    if (query.type) {
      const typeFiltered = getAlertsByType(query.type);
      alerts = alerts.filter((alert) =>
        typeFiltered.some((item) => item.id === alert.id)
      );
    }

    if (query.severity) {
      const severityFiltered = getAlertsBySeverity(query.severity);
      alerts = alerts.filter((alert) =>
        severityFiltered.some((item) => item.id === alert.id)
      );
    }

    res.json({ alerts });
  })
);

export default router;
