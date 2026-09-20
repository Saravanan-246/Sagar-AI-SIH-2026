import { Router } from "express";
import { predictSst } from "../services/research/sstResearchService";

const router = Router();

router.get("/sst/predict", async (req, res) => {
  try {
    const latRaw = parseFloat(req.query.latitude as string);
    const lonRaw = parseFloat(req.query.longitude as string);
    const lat = Number.isFinite(latRaw) ? latRaw : 8.76;
    const lon = Number.isFinite(lonRaw) ? lonRaw : 78.13;

    const result = await predictSst(lat, lon);

    // predictSst never throws for "we don't have enough real data" - that
    // is reported as status: "insufficient_data" (HTTP 200) so the page
    // can render an honest data-readiness state instead of a generic error.
    res.json(result);
  } catch (error) {
    console.error("[research] SST prediction failed:", error);
    res.status(500).json({
      status: "error",
      message: (error as Error).message || "SST prediction failed",
    });
  }
});

export default router;
