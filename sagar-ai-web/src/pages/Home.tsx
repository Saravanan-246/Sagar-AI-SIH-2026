import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Compass,
  Fish,
  Map,
  Navigation,
  ShieldAlert,
  Sparkles,
  Waves,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import MarineMap from "../components/map/MarineMap";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { ROUTES } from "../constants/routes";
import { useMarineData } from "../hooks/useMarineData";

import "./Home.css";

export default function Home() {
  const navigate = useNavigate();

  const { area, loading } = useMarineData();

  const marineRisk =
    area?.safety?.overallRisk ?? "unknown";

  const riskScore =
    area?.safety?.riskScore ?? 0;

  const seaStateRaw =
    area?.conditions?.seaState;

  const seaState = seaStateRaw
    ? seaStateRaw.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Unknown";

  const waveHeight =
    area?.conditions?.waveHeightM;

  const windSpeed =
    area?.conditions?.windSpeedKnots;

  const productivitySignal =
    area?.marineIndicators
      ?.productivitySignal ?? "unknown";

  return (
    <AppShell>
      <PageContainer
        className="home-page"
        fullHeight
      >
        <section className="home-layout">
          <div className="home-map-section">
            <div className="home-map-header">
              <div>
                <div className="home-eyebrow">
                  <Waves size={14} />
                  Marine situation
                </div>

                <h1>
                  {loading
                    ? "Marine conditions"
                    : area?.name ??
                      "Marine situation"}
                </h1>

                <p>
                  {area?.region ??
                    "Gulf of Mannar"}
                </p>
              </div>

              <div className="home-map-header-actions">
                <Badge
                  tone={
                    marineRisk === "low"
                      ? "success"
                      : marineRisk ===
                            "moderate"
                        ? "warning"
                        : marineRisk ===
                            "high" ||
                          marineRisk ===
                            "critical"
                          ? "danger"
                          : "neutral"
                  }
                  size="sm"
                >
                  {marineRisk.toUpperCase()}
                </Badge>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    navigate(ROUTES.MAP)
                  }
                >
                  <Map size={15} />
                  Full map
                </Button>
              </div>
            </div>

            <div className="home-map">
              <MarineMap />
            </div>

            <div className="home-map-status">
              <div className="home-map-location">
                <span className="home-location-dot" />
                <span>
                  {area?.name ??
                    "Marine operating area"}
                </span>
              </div>

              <div className="home-map-stats">
                <span>
                  Risk {riskScore}/100
                </span>

                <span className="home-divider" />

                <span>
                  Sea {seaState}
                </span>

                {typeof waveHeight ===
                  "number" && (
                  <>
                    <span className="home-divider" />
                    <span>
                      Waves{" "}
                      {waveHeight.toFixed(1)} m
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <section className="home-sagar-section">
            <div className="home-sagar-heading">
              <div className="home-sagar-title">
                <div className="home-sagar-avatar">
                  <Bot size={19} />
                </div>

                <div>
                  <div className="home-sagar-title-row">
                    <h2>Ask Sagar</h2>

                    <span className="home-sagar-ready">
                      <i />
                      Ready
                    </span>
                  </div>

                  <p>
                    Ask about sea conditions,
                    alerts, fishing zones or
                    safer routes.
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  navigate(ROUTES.CHAT)
                }
              >
                Open chat
                <ArrowRight size={14} />
              </Button>
            </div>

            <div className="home-sagar-composer">
              <button
                type="button"
                className="home-sagar-input"
                onClick={() =>
                  navigate(ROUTES.CHAT)
                }
              >
                <Sparkles size={16} />

                <span>
                  Ask Sagar anything about the
                  sea...
                </span>
              </button>
            </div>

            <div className="home-suggestions">
              <button
                type="button"
                onClick={() =>
                  navigate(ROUTES.CHAT)
                }
              >
                <ShieldAlert size={14} />
                Is it safe tomorrow morning?
              </button>

              <button
                type="button"
                onClick={() =>
                  navigate(ROUTES.CHAT)
                }
              >
                <AlertTriangle size={14} />
                Any lightning or cyclone alerts?
              </button>

              <button
                type="button"
                onClick={() =>
                  navigate(ROUTES.CHAT)
                }
              >
                <Fish size={14} />
                Which fishing zone is best?
              </button>

              <button
                type="button"
                onClick={() =>
                  navigate(ROUTES.CHAT)
                }
              >
                <Navigation size={14} />
                Find a safer route
              </button>
            </div>
          </section>

          <section className="home-quick-section">
            <div className="home-section-heading">
              <div>
                <span>Quick access</span>
                <h2>Marine tools</h2>
              </div>
            </div>

            <div className="home-quick-actions">
              <button
                type="button"
                className="home-quick-action"
                onClick={() =>
                  navigate(ROUTES.ROUTE)
                }
              >
                <div className="home-quick-icon route">
                  <Navigation size={17} />
                </div>

                <div>
                  <strong>Plan route</strong>
                  <span>
                    Compare safer marine
                    routes
                  </span>
                </div>

                <ArrowRight size={15} />
              </button>

              <button
                type="button"
                className="home-quick-action"
                onClick={() =>
                  navigate(ROUTES.ALERTS)
                }
              >
                <div className="home-quick-icon alert">
                  <AlertTriangle size={17} />
                </div>

                <div>
                  <strong>Marine alerts</strong>
                  <span>
                    Review active hazards
                  </span>
                </div>

                <ArrowRight size={15} />
              </button>

              <button
                type="button"
                className="home-quick-action"
                onClick={() =>
                  navigate(ROUTES.SCENARIO)
                }
              >
                <div className="home-quick-icon scenario">
                  <Compass size={17} />
                </div>

                <div>
                  <strong>What-if analysis</strong>
                  <span>
                    Test changing conditions
                  </span>
                </div>

                <ArrowRight size={15} />
              </button>
            </div>
          </section>

          <section className="home-context-row">
            <div className="home-context-item">
              <span>Wind</span>
              <strong>
                {typeof windSpeed ===
                "number"
                  ? `${windSpeed} kn`
                  : "—"}
              </strong>
            </div>

            <div className="home-context-item">
              <span>Sea state</span>
              <strong>
                {seaState}
              </strong>
            </div>

            <div className="home-context-item">
              <span>Productivity</span>
              <strong className="home-context-productivity">
                {String(
                  productivitySignal,
                ).toUpperCase()}
              </strong>
            </div>

            <button
              type="button"
              className="home-context-map"
              onClick={() =>
                navigate(ROUTES.MAP)
              }
            >
              <Map size={15} />
              Explore marine map
              <ArrowRight size={14} />
            </button>
          </section>
        </section>
      </PageContainer>
    </AppShell>
  );
}