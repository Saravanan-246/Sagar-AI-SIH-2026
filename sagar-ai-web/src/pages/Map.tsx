import {
  AlertTriangle,
  Bell,
  ChevronRight,
  Crosshair,
  Fish,
  Layers3,
  Map as MapIcon,
  Navigation,
  ShieldAlert,
  Waves,
  Wind,
} from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import MarineMap from "../components/map/MarineMap";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { ROUTES } from "../constants/routes";
import { useActiveAlerts } from "../hooks/useAlerts";
import { useMarineData } from "../hooks/useMarineData";

import "./Map.css";

type Severity =
  | "low"
  | "moderate"
  | "high"
  | "critical";

function severityTone(
  severity: string,
) {
  switch (severity) {
    case "critical":
    case "high":
      return "danger" as const;

    case "moderate":
      return "warning" as const;

    default:
      return "success" as const;
  }
}

function formatType(type: string) {
  return type
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function alertIcon(type: string) {
  switch (type) {
    case "lightning":
      return AlertTriangle;

    case "cyclone":
      return ShieldAlert;

    case "high_waves":
    case "rough_sea":
      return Waves;

    case "strong_wind":
      return Wind;

    default:
      return Bell;
  }
}

export default function Map() {
  const navigate = useNavigate();

  const {
    area,
    loading: marineLoading,
  } = useMarineData();

  const {
    alerts,
    loading: alertsLoading,
  } = useActiveAlerts();

  const topAlerts = useMemo(() => {
    return [...alerts]
      .sort((a, b) => {
        const priority: Record<
          Severity,
          number
        > = {
          critical: 4,
          high: 3,
          moderate: 2,
          low: 1,
        };

        return (
          (priority[
            b.severity as Severity
          ] ?? 0) -
          (priority[
            a.severity as Severity
          ] ?? 0)
        );
      })
      .slice(0, 3);
  }, [alerts]);

  const risk =
    area?.safety?.overallRisk ??
    "unknown";

  const riskScore =
    area?.safety?.riskScore ?? 0;

  const wind =
    area?.conditions?.windSpeed?.value;

  const waves =
    area?.conditions?.waveHeight?.value;

  const seaState =
    area?.conditions?.seaState?.label ??
    "Unknown";

  return (
    <AppShell>
      <PageContainer
        className="map-page"
        fullHeight
      >
        <div className="map-workspace">
          <section className="map-main">
            <div className="map-header">
              <div className="map-title-block">
                <div className="map-eyebrow">
                  <MapIcon size={14} />
                  Marine intelligence
                </div>

                <h1>Marine Map</h1>

                <p>
                  Explore marine conditions,
                  fishing zones, hazards and
                  route information.
                </p>
              </div>

              <div className="map-header-actions">
                <Badge
                  tone={
                    risk === "low"
                      ? "success"
                      : risk === "moderate"
                        ? "warning"
                        : risk === "high" ||
                            risk === "critical"
                          ? "danger"
                          : "neutral"
                  }
                  size="sm"
                >
                  {risk.toUpperCase()}
                </Badge>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    navigate(
                      ROUTES.ROUTE,
                    )
                  }
                >
                  <Navigation
                    size={15}
                  />
                  Plan route
                </Button>
              </div>
            </div>

            <div className="map-canvas">
              <MarineMap />

              <div className="map-canvas-topbar">
                <div className="map-location-pill">
                  <Crosshair size={14} />

                  <span>
                    {marineLoading
                      ? "Loading area..."
                      : area?.name ??
                        "Marine operating area"}
                  </span>
                </div>

                <div className="map-tools-pill">
                  <Layers3 size={14} />
                  <span>
                    Map layers
                  </span>
                </div>
              </div>
            </div>

            <div className="map-bottom-status">
              <div className="map-status-item">
                <Waves size={14} />
                <div>
                  <span>Sea state</span>
                  <strong>
                    {seaState}
                  </strong>
                </div>
              </div>

              <div className="map-status-item">
                <Wind size={14} />
                <div>
                  <span>Wind</span>
                  <strong>
                    {typeof wind ===
                    "number"
                      ? `${wind} km/h`
                      : "—"}
                  </strong>
                </div>
              </div>

              <div className="map-status-item">
                <Waves size={14} />
                <div>
                  <span>Waves</span>
                  <strong>
                    {typeof waves ===
                    "number"
                      ? `${waves.toFixed(
                          1,
                        )} m`
                      : "—"}
                  </strong>
                </div>
              </div>

              <div className="map-status-item">
                <ShieldAlert
                  size={14}
                />
                <div>
                  <span>Risk</span>
                  <strong>
                    {riskScore}/100
                  </strong>
                </div>
              </div>
            </div>
          </section>

          <aside className="map-sidebar">
            <section className="map-panel map-area-panel">
              <div className="map-panel-heading">
                <div>
                  <span>
                    Current area
                  </span>

                  <h2>
                    {area?.name ??
                      "Marine area"}
                  </h2>
                </div>

                <Badge
                  tone={
                    risk === "low"
                      ? "success"
                      : risk === "moderate"
                        ? "warning"
                        : risk === "high" ||
                            risk === "critical"
                          ? "danger"
                          : "neutral"
                  }
                  size="sm"
                >
                  {risk}
                </Badge>
              </div>

              <div className="map-area-grid">
                <div>
                  <span>Region</span>
                  <strong>
                    {area?.region ??
                      "—"}
                  </strong>
                </div>

                <div>
                  <span>Risk score</span>
                  <strong>
                    {riskScore}/100
                  </strong>
                </div>

                <div>
                  <span>Wind</span>
                  <strong>
                    {typeof wind ===
                    "number"
                      ? `${wind} km/h`
                      : "—"}
                  </strong>
                </div>

                <div>
                  <span>Waves</span>
                  <strong>
                    {typeof waves ===
                    "number"
                      ? `${waves.toFixed(
                          1,
                        )} m`
                      : "—"}
                  </strong>
                </div>
              </div>

              <button
                type="button"
                className="map-panel-link"
                onClick={() => {
                  if (area?.id) {
                    navigate(
                      ROUTES.AREA(area.id),
                    );
                  }
                }}
              >
                <span>
                  View area details
                </span>

                <ChevronRight
                  size={15}
                />
              </button>
            </section>

            <section className="map-panel">
              <div className="map-panel-heading">
                <div>
                  <span>
                    Marine hazards
                  </span>

                  <h2>
                    Active alerts
                  </h2>
                </div>

                <button
                  type="button"
                  className="map-panel-icon-button"
                  onClick={() =>
                    navigate(
                      ROUTES.ALERTS,
                    )
                  }
                  aria-label="View all marine alerts"
                >
                  <Bell size={15} />
                </button>
              </div>

              {alertsLoading ? (
                <div className="map-panel-loading">
                  Loading alerts...
                </div>
              ) : topAlerts.length === 0 ? (
                <div className="map-no-alerts">
                  <div className="map-no-alerts-icon">
                    <ShieldAlert
                      size={17}
                    />
                  </div>

                  <div>
                    <strong>
                      No active alerts
                    </strong>

                    <span>
                      No current hazards are
                      available in the alert
                      set.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="map-alert-list">
                  {topAlerts.map(
                    (alert) => {
                      const Icon =
                        alertIcon(
                          alert.type,
                        );

                      return (
                        <button
                          key={alert.id}
                          type="button"
                          className="map-alert-item"
                          onClick={() =>
                            navigate(
                              ROUTES.ALERTS,
                            )
                          }
                        >
                          <div
                            className={`map-alert-icon ${alert.severity}`}
                          >
                            <Icon
                              size={15}
                            />
                          </div>

                          <div className="map-alert-content">
                            <strong>
                              {
                                alert.title
                              }
                            </strong>

                            <span>
                              {formatType(
                                alert.type,
                              )}{" "}
                              ·{" "}
                              {alert.area}
                            </span>
                          </div>

                          <ChevronRight
                            size={14}
                            className="map-alert-arrow"
                          />
                        </button>
                      );
                    },
                  )}
                </div>
              )}

              <button
                type="button"
                className="map-panel-link"
                onClick={() =>
                  navigate(
                    ROUTES.ALERTS,
                  )
                }
              >
                <span>
                  View all alerts
                </span>

                <ChevronRight
                  size={15}
                />
              </button>
            </section>

            <section className="map-panel map-actions-panel">
              <div className="map-panel-heading">
                <div>
                  <span>
                    Quick access
                  </span>

                  <h2>
                    Explore marine data
                  </h2>
                </div>
              </div>

              <button
                type="button"
                className="map-action"
                onClick={() =>
                  navigate(
                    ROUTES.ROUTE,
                  )
                }
              >
                <div className="map-action-icon route">
                  <Navigation
                    size={16}
                  />
                </div>

                <div>
                  <strong>
                    Route planning
                  </strong>

                  <span>
                    Compare safer routes
                  </span>
                </div>

                <ChevronRight
                  size={15}
                />
              </button>

              <button
                type="button"
                className="map-action"
                onClick={() =>
                  navigate(
                    ROUTES.SCENARIO,
                  )
                }
              >
                <div className="map-action-icon scenario">
                  <Layers3 size={16} />
                </div>

                <div>
                  <strong>
                    What-if analysis
                  </strong>

                  <span>
                    Test changing conditions
                  </span>
                </div>

                <ChevronRight
                  size={15}
                />
              </button>

              <button
                type="button"
                className="map-action"
                onClick={() =>
                  navigate(
                    ROUTES.CHAT,
                  )
                }
              >
                <div className="map-action-icon fishing">
                  <Fish size={16} />
                </div>

                <div>
                  <strong>
                    Ask Sagar
                  </strong>

                  <span>
                    Ask about this marine area
                  </span>
                </div>

                <ChevronRight
                  size={15}
                />
              </button>
            </section>
          </aside>
        </div>
      </PageContainer>
    </AppShell>
  );
}