import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  MapPin,
  Navigation,
  Pause,
  Play,
  Route as RouteIcon,
  ShieldAlert,
  Sparkles,
  Square,
  Waves,
  Wind,
  XCircle,
} from "lucide-react";
import {
  useEffect,
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
import { useJourneySimulation } from "../hooks/useJourneySimulation";
import { getMarineAreas } from "../services/marine/marineData";
import { useAppStore } from "../store/appStore";
import { ROUTES } from "../constants/routes";

import type { RoutePlan } from "../types/route";

import "./Route.css";

type NamedPoint = {
  label: string;
  latitude: number;
  longitude: number;
};

type OptionLabel = "RECOMMENDED" | "ALTERNATIVE" | "AVOID";

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

function optionLabel(
  route: RoutePlan,
  index: number,
): OptionLabel {
  if (
    route.routeDecision === "avoid" ||
    route.routeDecision === "blocked"
  ) {
    return "AVOID";
  }

  return index === 0 ? "RECOMMENDED" : "ALTERNATIVE";
}

function optionLabelTone(label: OptionLabel) {
  switch (label) {
    case "RECOMMENDED":
      return "success" as const;
    case "ALTERNATIVE":
      return "neutral" as const;
    case "AVOID":
      return "danger" as const;
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

function buildWhyThisRoute(route: RoutePlan): string[] {
  const reasons: string[] = [];

  if (route.reason) {
    reasons.push(route.reason);
  }

  if (route.avoidedHazards && route.avoidedHazards.length > 0) {
    reasons.push(
      `Avoids ${route.avoidedHazards.join(" and ")}.`
    );
  }

  if (route.risk.level === "low") {
    reasons.push("Acceptable travel time for a low-risk corridor.");
  } else if (route.risk.score <= 45) {
    reasons.push("Acceptable travel time for the current risk level.");
  }

  return reasons;
}

export default function RoutePage() {
  const navigate = useNavigate();

  const {
    routes,
    routeOptions,
    selectedRoute,
    selectRoute,
    loading,
    error,
    calculate,
    refresh,
  } = useRoute();

  const pendingRoute = useAppStore(
    (state) => state.pendingRoute,
  );

  const clearPendingRoute = useAppStore(
    (state) => state.clearPendingRoute,
  );

  const [originLabel, setOriginLabel] =
    useState("");

  const [destinationLabel, setDestinationLabel] =
    useState("");

  const [hasCalculated, setHasCalculated] =
    useState(false);

  const routeList = useMemo(
    () => routes ?? [],
    [routes],
  );

  const locationOptions = useMemo<
    NamedPoint[]
  >(() => {
    const map = new Map<string, NamedPoint>();

    for (const area of getMarineAreas()) {
      map.set(area.name, {
        label: area.name,
        latitude: area.coordinates.latitude,
        longitude: area.coordinates.longitude,
      });
    }

    for (const route of routeList) {
      const originLabel =
        route.origin.name ??
        `${route.origin.latitude}, ${route.origin.longitude}`;

      const destinationLabel =
        route.destination.name ??
        `${route.destination.latitude}, ${route.destination.longitude}`;

      map.set(originLabel, {
        label: originLabel,
        latitude: route.origin.latitude,
        longitude: route.origin.longitude,
      });

      map.set(destinationLabel, {
        label: destinationLabel,
        latitude: route.destination.latitude,
        longitude: route.destination.longitude,
      });
    }

    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [routeList]);

  const displayedOptions = useMemo(() => {
    if (routeOptions.length > 0) {
      return routeOptions;
    }

    return routeList;
  }, [routeOptions, routeList]);

  const selected =
    selectedRoute ??
    displayedOptions[0] ??
    routeList[0] ??
    null;

  const safestOption = displayedOptions[0] ?? null;

  const journey = useJourneySimulation(selected);

  // Apply a route Sagar found via chat ("give me the safest route...").
  useEffect(() => {
    if (pendingRoute) {
      selectRoute(pendingRoute);
      setHasCalculated(true);
      clearPendingRoute();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRoute]);

  const handleCalculate = async () => {
    const origin = locationOptions.find(
      (item) => item.label === originLabel,
    );

    const destination = locationOptions.find(
      (item) => item.label === destinationLabel,
    );

    if (!origin || !destination) {
      return;
    }

    journey.stop();

    const calculated = await calculate(
      {
        latitude: origin.latitude,
        longitude: origin.longitude,
      },
      {
        latitude: destination.latitude,
        longitude: destination.longitude,
      },
    );

    if (calculated) {
      setHasCalculated(true);
    }
  };

  const handleSelectRouteId = (routeId: string) => {
    const found =
      displayedOptions.find(
        (route) => route.id === routeId,
      ) ??
      routeList.find(
        (route) => route.id === routeId,
      );

    if (found) {
      journey.stop();
      selectRoute(found);
    }
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

  const whyThisRoute = buildWhyThisRoute(selected);

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

            <section className="route-planner-bar">
              <div className="route-planner-field">
                <span>From</span>
                <select
                  value={originLabel}
                  onChange={(event) =>
                    setOriginLabel(event.target.value)
                  }
                >
                  <option value="">
                    Select starting point
                  </option>

                  {locationOptions.map((item) => (
                    <option
                      key={item.label}
                      value={item.label}
                    >
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <ArrowRight
                size={15}
                className="route-planner-arrow"
              />

              <div className="route-planner-field">
                <span>To</span>
                <select
                  value={destinationLabel}
                  onChange={(event) =>
                    setDestinationLabel(
                      event.target.value,
                    )
                  }
                >
                  <option value="">
                    Select destination
                  </option>

                  {locationOptions.map((item) => (
                    <option
                      key={item.label}
                      value={item.label}
                    >
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                variant="primary"
                size="sm"
                disabled={
                  !originLabel ||
                  !destinationLabel ||
                  loading
                }
                onClick={handleCalculate}
              >
                {loading ? "Planning..." : "Plan route"}
              </Button>
            </section>

            {error && (
              <div className="route-inline-error">
                <AlertTriangle size={14} />
                <span>{error}</span>
              </div>
            )}

            {hasCalculated && safestOption && (
              <section className="route-safest-banner">
                <div className="route-safest-icon">
                  <ShieldAlert size={16} />
                </div>

                <div className="route-safest-body">
                  <span>Safest viable route</span>
                  <strong>{safestOption.name}</strong>
                  <p>
                    Risk {safestOption.risk.score}/100 ·{" "}
                    {safestOption.distanceKm.toFixed(1)} km ·{" "}
                    {formatDuration(
                      safestOption.estimatedDurationHours,
                    )}{" "}
                    · {safestOption.reason}
                  </p>
                </div>
              </section>
            )}

            <section className="route-map-card">
              <div className="route-map">
                <MarineMap
                  overrideRoutes={
                    hasCalculated ? displayedOptions : undefined
                  }
                  selectedRouteId={selected.id}
                  onSelectRoute={handleSelectRouteId}
                  startPoint={selected.origin}
                  endPoint={selected.destination}
                  journeyPosition={journey.position}
                  journeyBearingDeg={journey.bearingDeg}
                />
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
                    {hasCalculated
                      ? "Viable route options"
                      : "Available route options"}
                  </span>

                  <h2>
                    Select a route
                  </h2>
                </div>

                <span>
                  {displayedOptions.length} options
                </span>
              </div>

              <div className="route-options">
                {displayedOptions.map((route, index) => {
                  const isSelected =
                    route.id === selected.id;

                  const label = optionLabel(
                    route,
                    index,
                  );

                  return (
                    <button
                      key={route.id}
                      type="button"
                      className={
                        isSelected
                          ? "route-option selected"
                          : "route-option"
                      }
                      onClick={() => {
                        journey.stop();
                        selectRoute(route);
                      }}
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
                          tone={optionLabelTone(label)}
                          size="sm"
                        >
                          {label}
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
                    Why this route?
                  </span>

                  <ul className="route-why-list">
                    {whyThisRoute.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            <section className="route-panel route-journey-panel">
              <div className="route-panel-heading">
                <div>
                  <span>Demo simulation</span>
                  <h2>Journey</h2>
                </div>
              </div>

              <p className="route-journey-disclaimer">
                Route simulation for demonstration only.
                This is not a live vessel position or AIS
                tracking.
              </p>

              {journey.status === "idle" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  fullWidth
                  onClick={journey.start}
                >
                  <Play size={14} />
                  Simulate journey
                </Button>
              ) : (
                <div className="route-journey-progress">
                  <div className="route-journey-meta">
                    <span>
                      From: {selected.origin.name}
                    </span>
                    <span>
                      To: {selected.destination.name}
                    </span>
                  </div>

                  <div className="route-risk-bar route-journey-bar">
                    <span
                      className="risk-low"
                      style={{
                        width: `${Math.round(
                          journey.progress * 100,
                        )}%`,
                      }}
                    />
                  </div>

                  <div className="route-journey-stats">
                    <span>
                      Progress:{" "}
                      {Math.round(journey.progress * 100)}%
                    </span>

                    <span>
                      ETA:{" "}
                      {journey.etaMinutesRemaining ?? "—"} min
                    </span>
                  </div>

                  <div className="route-journey-controls">
                    {journey.status === "running" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={journey.pause}
                      >
                        <Pause size={14} />
                        Pause
                      </Button>
                    )}

                    {journey.status === "paused" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={journey.resume}
                      >
                        <Play size={14} />
                        Resume
                      </Button>
                    )}

                    {journey.status === "finished" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={journey.start}
                      >
                        <Play size={14} />
                        Replay
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={journey.stop}
                    >
                      <Square size={14} />
                      Stop
                    </Button>
                  </div>
                </div>
              )}
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
          </aside>
        </div>
      </PageContainer>
    </AppShell>
  );
}
