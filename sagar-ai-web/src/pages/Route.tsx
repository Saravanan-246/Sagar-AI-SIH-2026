import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  MapPin,
  Navigation,
  Route as RouteIcon,
  ShieldAlert,
  Sparkles,
  Waves,
  Wind,
  XCircle,
} from "lucide-react";
import {
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import MarineMap from "../components/map/MarineMap";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import LoadingState from "../components/ui/LoadingState";
import ErrorState from "../components/ui/ErrorState";
import useRoute from "../hooks/useRoute";
import { ROUTES } from "../constants/routes";

import "./Route.css";

type RouteRisk =
  | "low"
  | "moderate"
  | "high"
  | "critical";

function riskTone(
  level: string,
) {
  switch (level) {
    case "low":
      return "success" as const;

    case "moderate":
      return "warning" as const;

    case "high":
    case "critical":
      return "danger" as const;

    default:
      return "neutral" as const;
  }
}

function routeStatusLabel(
  status: string,
) {
  switch (status) {
    case "recommended":
      return "Recommended";

    case "caution":
      return "Use caution";

    case "blocked":
      return "Blocked";

    default:
      return "Review";
  }
}

function routeDecisionTone(
  decision: string,
) {
  switch (decision) {
    case "preferred":
      return "success" as const;

    case "caution":
      return "warning" as const;

    case "avoid":
    case "blocked":
      return "danger" as const;

    default:
      return "neutral" as const;
  }
}

function formatDuration(
  hours?: number,
) {
  if (
    typeof hours !== "number" ||
    !Number.isFinite(hours)
  ) {
    return "—";
  }

  const totalMinutes = Math.round(
    hours * 60,
  );

  const h = Math.floor(
    totalMinutes / 60,
  );

  const m = totalMinutes % 60;

  if (h === 0) {
    return `${m} min`;
  }

  if (m === 0) {
    return `${h} hr`;
  }

  return `${h} hr ${m} min`;
}

export default function RoutePage() {
  const navigate = useNavigate();

  const {
    routes,
    selectedRoute,
    selectRoute,
    loading,
    error,
    calculate,
    refresh,
  } = useRoute();

  const [originId, setOriginId] =
    useState("");

  const [destinationId, setDestinationId] =
    useState("");

  const [selectorOpen, setSelectorOpen] =
    useState(false);

  const routeList = useMemo(
    () => routes ?? [],
    [routes],
  );

  const selected =
    selectedRoute ??
    routeList[0] ??
    null;

  const handleCalculate = async () => {
    if (!originId || !destinationId) {
      return;
    }

    const originRoute =
      routeList.find(
        (route) =>
          route.origin.name === originId,
      );

    const destinationRoute =
      routeList.find(
        (route) =>
          route.destination.name ===
          destinationId,
      );

    if (
      !originRoute ||
      !destinationRoute
    ) {
      return;
    }

    await calculate(
      {
        latitude:
          originRoute.origin.latitude,
        longitude:
          originRoute.origin.longitude,
      },
      {
        latitude:
          destinationRoute.destination
            .latitude,
        longitude:
          destinationRoute.destination
            .longitude,
      },
    );
  };

  if (loading && !selected) {
    return (
      <AppShell>
        <PageContainer className="route-page">
          <div className="route-loading">
            <LoadingState
              label="Preparing route intelligence..."
            />
          </div>
        </PageContainer>
      </AppShell>
    );
  }

  if (error && !selected) {
    return (
      <AppShell>
        <PageContainer className="route-page">
          <ErrorState
            title="Route information unavailable"
            message={error}
            retry={refresh}
          />
        </PageContainer>
      </AppShell>
    );
  }

  if (!selected) {
    return (
      <AppShell>
        <PageContainer className="route-page">
          <EmptyState
            icon={RouteIcon}
            title="No routes available"
            description="There are no route options available in the current route data."
            action={{
              label: "Refresh routes",
              onClick: refresh,
            }}
          />
        </PageContainer>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageContainer
        className="route-page"
        fullHeight
      >
        <div className="route-layout">
          <main className="route-main">
            <header className="route-header">
              <div>
                <div className="route-eyebrow">
                  <RouteIcon size={14} />
                  Navigation intelligence
                </div>

                <h1>Route Planning</h1>

                <p>
                  Compare route options using
                  distance, travel time, marine
                  risk and active hazards.
                </p>
              </div>

              <div className="route-header-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={refresh}
                  disabled={loading}
                >
                  Refresh
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    navigate(
                      ROUTES.MAP,
                    )
                  }
                >
                  <Navigation size={15} />
                  Open map
                </Button>
              </div>
            </header>

            <section className="route-map-card">
              <div className="route-map">
                <MarineMap />
              </div>

              <div className="route-map-footer">
                <div className="route-endpoint">
                  <span className="route-endpoint-dot start" />

                  <div>
                    <span>Origin</span>
                    <strong>
                      {selected.origin.name}
                    </strong>
                  </div>
                </div>

                <ArrowRight
                  size={15}
                  className="route-direction"
                />

                <div className="route-endpoint">
                  <span className="route-endpoint-dot end" />

                  <div>
                    <span>Destination</span>
                    <strong>
                      {
                        selected.destination
                          .name
                      }
                    </strong>
                  </div>
                </div>
              </div>
            </section>

            <section className="route-options-section">
              <div className="route-section-header">
                <div>
                  <span>
                    Available route options
                  </span>

                  <h2>
                    Select a route
                  </h2>
                </div>

                <span>
                  {routeList.length} options
                </span>
              </div>

              <div className="route-options">
                {routeList.map((route) => {
                  const isSelected =
                    route.id === selected.id;

                  return (
                    <button
                      key={route.id}
                      type="button"
                      className={
                        isSelected
                          ? "route-option selected"
                          : "route-option"
                      }
                      onClick={() =>
                        selectRoute(route)
                      }
                    >
                      <div className="route-option-top">
                        <div className="route-option-name">
                          <span
                            className={
                              isSelected
                                ? "route-radio active"
                                : "route-radio"
                            }
                          />
                          <strong>
                            {route.name}
                          </strong>
                        </div>

                        <Badge
                          tone={riskTone(
                            route.risk
                              .level,
                          )}
                          size="sm"
                        >
                          {routeStatusLabel(
                            route.status,
                          )}
                        </Badge>
                      </div>

                      <div className="route-option-stats">
                        <span>
                          {route.distanceKm.toFixed(
                            1,
                          )}{" "}
                          km
                        </span>

                        <span>
                          {formatDuration(
                            route.estimatedDurationHours,
                          )}
                        </span>

                        <span>
                          Risk{" "}
                          {route.risk.score}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </main>

          <aside className="route-sidebar">
            <section className="route-panel route-selected-panel">
              <div className="route-panel-heading">
                <div>
                  <span>
                    Selected route
                  </span>

                  <h2>
                    {selected.name}
                  </h2>
                </div>

                <Badge
                  tone={routeDecisionTone(
                    selected.routeDecision,
                  )}
                  size="sm"
                >
                  {selected.routeDecision.toUpperCase()}
                </Badge>
              </div>

              <div className="route-summary-stats">
                <div>
                  <Navigation size={15} />
                  <span>Distance</span>
                  <strong>
                    {selected.distanceKm.toFixed(
                      1,
                    )}{" "}
                    km
                  </strong>
                </div>

                <div>
                  <Clock3 size={15} />
                  <span>Estimated time</span>
                  <strong>
                    {formatDuration(
                      selected.estimatedDurationHours,
                    )}
                  </strong>
                </div>

                <div>
                  <ShieldAlert size={15} />
                  <span>Risk score</span>
                  <strong>
                    {selected.risk.score}/100
                  </strong>
                </div>

                <div>
                  <Navigation size={15} />
                  <span>Speed</span>
                  <strong>
                    {
                      selected.recommendedSpeedKnots
                    }{" "}
                    kn
                  </strong>
                </div>
              </div>

              <div className="route-risk-block">
                <div className="route-risk-heading">
                  <span>Marine risk</span>

                  <Badge
                    tone={riskTone(
                      selected.risk.level,
                    )}
                    size="sm"
                  >
                    {selected.risk.level.toUpperCase()}
                  </Badge>
                </div>

                <div className="route-risk-bar">
                  <span
                    className={`risk-${selected.risk.level}`}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          selected.risk
                            .score,
                        ),
                      )}%`,
                    }}
                  />
                </div>
              </div>

              <div className="route-reason">
                <Sparkles size={15} />

                <div>
                  <span>
                    Route reasoning
                  </span>

                  <p>
                    {selected.reason}
                  </p>
                </div>
              </div>
            </section>

            <section className="route-panel">
              <div className="route-panel-heading">
                <div>
                  <span>
                    Marine conditions
                  </span>

                  <h2>
                    Route environment
                  </h2>
                </div>
              </div>

              <div className="route-condition-list">
                <div className="route-condition">
                  <Wind size={15} />

                  <div>
                    <span>
                      Wind
                    </span>
                    <strong>
                      {
                        selected.conditions
                          .wind
                      }
                    </strong>
                  </div>
                </div>

                <div className="route-condition">
                  <Waves size={15} />

                  <div>
                    <span>
                      Waves
                    </span>
                    <strong>
                      {
                        selected.conditions
                          .waves
                      }
                    </strong>
                  </div>
                </div>

                <div className="route-condition">
                  <MapPin size={15} />

                  <div>
                    <span>
                      Visibility
                    </span>
                    <strong>
                      {
                        selected.conditions
                          .visibility
                      }
                    </strong>
                  </div>
                </div>
              </div>
            </section>

            <section className="route-panel">
              <div className="route-panel-heading">
                <div>
                  <span>
                    Safety assessment
                  </span>

                  <h2>
                    Route restrictions
                  </h2>
                </div>
              </div>

              {selected.avoidedHazards?.length ? (
                <div className="route-hazards">
                  {selected.avoidedHazards.map(
                    (hazard) => (
                      <div
                        key={hazard}
                        className="route-hazard"
                      >
                        <CheckCircle2
                          size={14}
                        />
                        <span>
                          {hazard}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <div className="route-no-hazards">
                  <CheckCircle2 size={16} />

                  <span>
                    No recorded hazards are
                    listed as avoided on this
                    route.
                  </span>
                </div>
              )}

              {selected.routeDecision ===
                "blocked" && (
                <div className="route-blocked">
                  <XCircle size={16} />

                  <div>
                    <strong>
                      Route blocked
                    </strong>

                    <span>
                      This route should not be
                      used under the current
                      boundary and hazard
                      assessment.
                    </span>
                  </div>
                </div>
              )}
            </section>

            <section className="route-panel route-planner-panel">
              <button
                type="button"
                className="route-collapse"
                onClick={() =>
                  setSelectorOpen(
                    (current) => !current,
                  )
                }
              >
                <div>
                  <span>
                    Route parameters
                  </span>

                  <strong>
                    Change origin or
                    destination
                  </strong>
                </div>

                <ChevronDown
                  size={16}
                  className={
                    selectorOpen
                      ? "route-chevron open"
                      : "route-chevron"
                  }
                />
              </button>

              {selectorOpen && (
                <div className="route-selector-body">
                  <label>
                    Origin
                    <select
                      value={originId}
                      onChange={(event) =>
                        setOriginId(
                          event.target
                            .value,
                        )
                      }
                    >
                      <option value="">
                        Select origin
                      </option>

                      {Array.from(
                        new Map(
                          routeList.map(
                            (route) => [
                              route.origin
                                .name,
                              route
                                .origin
                                .name,
                            ],
                          ),
                        ).values(),
                      ).map((name) => (
                        <option
                          key={name}
                          value={name}
                        >
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Destination
                    <select
                      value={
                        destinationId
                      }
                      onChange={(event) =>
                        setDestinationId(
                          event.target
                            .value,
                        )
                      }
                    >
                      <option value="">
                        Select destination
                      </option>

                      {Array.from(
                        new Map(
                          routeList.map(
                            (route) => [
                              route.destination
                                .name,
                              route
                                .destination
                                .name,
                            ],
                          ),
                        ).values(),
                      ).map((name) => (
                        <option
                          key={name}
                          value={name}
                        >
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <Button
                    variant="primary"
                    size="sm"
                    fullWidth
                    disabled={
                      !originId ||
                      !destinationId ||
                      loading
                    }
                    onClick={
                      handleCalculate
                    }
                  >
                    {loading
                      ? "Calculating..."
                      : "Calculate route"}
                  </Button>

                  {error && (
                    <div className="route-inline-error">
                      <AlertTriangle
                        size={14}
                      />
                      <span>{error}</span>
                    </div>
                  )}
                </div>
              )}
            </section>
          </aside>
        </div>
      </PageContainer>
    </AppShell>
  );
}