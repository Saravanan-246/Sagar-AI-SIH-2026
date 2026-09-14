import cors from "cors";
import express, { type Express } from "express";

import { config } from "./config";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

import chatRoutes from "./api/chat.routes";
import marineRoutes from "./api/marine.routes";
import weatherRoutes from "./api/weather.routes";
import oceanRoutes from "./api/ocean.routes";
import alertsRoutes from "./api/alerts.routes";
import zonesRoutes from "./api/zones.routes";
import routesRoutes from "./api/routes.routes";
import riskRoutes from "./api/risk.routes";
import scenariosRoutes from "./api/scenarios.routes";

export function createApp(): Express {
  const app = express();

  app.use(
    cors({
      origin: config.corsOrigins,
    })
  );

  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "sagar-ai-server" });
  });

  app.use("/api/chat", chatRoutes);
  app.use("/api/marine", marineRoutes);
  app.use("/api/weather", weatherRoutes);
  app.use("/api/ocean", oceanRoutes);
  app.use("/api/alerts", alertsRoutes);
  app.use("/api/zones", zonesRoutes);
  app.use("/api/routes", routesRoutes);
  app.use("/api/risk", riskRoutes);
  app.use("/api/scenarios", scenariosRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
