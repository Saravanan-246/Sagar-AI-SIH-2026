import { Router } from "express";

import { getMarineModelGrid } from "../services/data/sourceAdapters/openMeteoAdapter";
import { asyncHandler } from "../middleware/validate";

const router = Router();

/**
 * Map-only marine model grid (Open-Meteo). Deliberately separate from
 * /api/marine (Sagar's local marine-area dataset) so this real,
 * cached, external forecast data can never be mistaken for - or
 * silently merged into - the local prototype dataset that endpoint
 * serves.
 */
router.get(
  "/grid",
  asyncHandler(async (_req, res) => {
    const result = await getMarineModelGrid();
    res.json(result);
  })
);

export default router;
