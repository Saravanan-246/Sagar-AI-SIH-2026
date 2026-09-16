import {
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
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import MarineMap from "../components/map/MarineMap";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { ROUTES } from "../constants/routes";
import { useActiveAlerts } from "../hooks/useAlerts";
import { useMarineData } from "../hooks/useMarineData";
import { useAppStore } from "../store/appStore";
import {
  alertSeverityTone,
  alertTypeIcon,
  formatAlertType,
} from "../utils/alertPresentation";

import "./Map.css";

type Severity =
  | "low"
  | "moderate"
  | "high"
  | "critical";

export default function Map() {
  const navigate = useNavigate();

  const clearPendingMapFocus = useAppStore(
    (state) => state.clearPendingMapFocus
  );

  // Captured once on arrival so clearing the store's pending focus
  // afterwards doesn't bounce the selected area back to the default.
  const [pendingFocus] = useState(
    () => useAppStore.getState().pendingMapFocus
  );

  const focusedAreaId = pendingFocus?.areaId;

  const {
    area,
    areas,
    loading: marineLoading,
  } = useMarineData({
    areaId: focusedAreaId,
  });

  useEffect(() => {
    clearPendingMapFocus();
    // Clear once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Actually move the map to whatever Sagar chat handed off - an
  // explicit coordinate (an alert/zone/route point) takes priority,
  // otherwise fall back to the resolved area's centroid once it loads.
  const focusCenter = useMemo(() => {
    if (
      typeof pendingFocus?.latitude === "number" &&
      typeof pendingFocus?.longitude === "number"
    ) {
      return {
        latitude: pendingFocus.latitude,
        longitude: pendingFocus.longitude,
      };
    }

    if (area?.coordinates) {
      return area.coordinates;
    }

    return undefined;
  }, [pendingFocus, area]);

  const hasFocusTarget = Boolean(pendingFocus);

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
    area?.conditions?.windSpeedKnots;

  const waves =
    area?.conditions?.waveHeightM;

  const seaState =
    area?.conditions?.seaState
      ? area.conditions.seaState
          .replaceAll("_", " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : "Unknown";

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
                  tone={alertSeverityTone(risk)}
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
              <MarineMap
                areas={areas}
                alerts={alerts}
                center={focusCenter}
                zoom={hasFocusTarget ? 11 : undefined}
                highlight={
                  hasFocusTarget && focusCenter
                    ? { ...focusCenter, label: pendingFocus?.label ?? area?.name }
                    : null
                }
              />

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
                      ? `${wind} kn`
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
                  tone={alertSeverityTone(risk)}
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
                      ? `${wind} kn`
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
                        alertTypeIcon(
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
                              {formatAlertType(
                                alert.type,
                              )}{" "}
                              ·{" "}
                              {alert.location.name}
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