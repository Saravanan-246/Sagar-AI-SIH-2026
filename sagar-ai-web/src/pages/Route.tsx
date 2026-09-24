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
  WifiOff,
  Waves,
  Wind,
  XCircle,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import MarineMap from "../components/map/MarineMap";
import AskSagarButton from "../components/chat/AskSagarButton";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import LoadingState from "../components/ui/LoadingState";
import ErrorState from "../components/ui/ErrorState";
import useRoute from "../hooks/useRoute";
import { useJourneySimulation } from "../hooks/useJourneySimulation";
import { getMarineAreas } from "../services/marine/marineData";
import { nearestMarineAreaName } from "../utils/geo";
import { useAppStore } from "../store/appStore";
import { ROUTES } from "../constants/routes";

import type { RoutePlan } from "../types/route";
import type { MarineArea } from "../types/marine";

import "./Route.css";

type NamedPoint = {
  label: string;
  latitude: number;
  longitude: number;
};

type OptionLabel = "RECOMMENDED" | "ALTERNATIVE" | "AVOID";

function riskTone(level: string): "success" | "warning" | "danger" | "neutral" {
  switch (level.toLowerCase()) {
    case "low":
      return "success";
    case "moderate":
      return "warning";
    case "high":
    case "critical":
      return "danger";
    default:
      return "neutral";
  }
}

function routeDecisionTone(decision: string): "success" | "warning" | "danger" | "neutral" {
  switch (decision.toLowerCase()) {
    case "preferred":
      return "success";
    case "caution":
      return "warning";
    case "avoid":
    case "blocked":
      return "danger";
    default:
      return "neutral";
  }
}

function optionLabel(route: RoutePlan, index: number): OptionLabel {
  if (route.routeDecision === "avoid" || route.routeDecision === "blocked") {
    return "AVOID";
  }
  return index === 0 ? "RECOMMENDED" : "ALTERNATIVE";
}

function optionLabelTone(label: OptionLabel): "success" | "warning" | "danger" | "neutral" {
  switch (label) {
    case "RECOMMENDED":
      return "success";
    case "ALTERNATIVE":
      return "neutral";
    case "AVOID":
      return "danger";
  }
}

function formatDuration(hours?: number): string {
  if (typeof hours !== "number" || !Number.isFinite(hours)) {
    return "—";
  }
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

/** A question that names the selected route's origin/destination by
 * their nearest configured marine area (a route's own point names, e.g.
 * "Thoothukudi New Port Outer", aren't the configured area names Chat's
 * deterministic "from X to Y" parser resolves), so it resolves through
 * Chat's existing route parsing to the same real route - no new chat
 * field, no second pipeline. Uses the literal phrase "safest route" (a
 * scored keyword phrase in the backend's own deterministic classifier,
 * intent.ts) so this - an 11+ word question - resolves on the fast
 * deterministic path instead of tripping the classifier's multi-topic
 * AI-classification gate (verified live: relying on the AI classifier
 * for an unscored phrasing gave an inconsistent, sometimes-wrong
 * intent for otherwise-identical questions about different areas). */
function buildAskSagarPrompt(route: RoutePlan, areas: MarineArea[]): string {
  const origin = nearestMarineAreaName(route.origin, areas);
  const destination = nearestMarineAreaName(route.destination, areas);

  if (origin && destination && origin !== destination) {
    return `Why is the safest route from ${origin} to ${destination}?`;
  }

  return `Why is ${route.name} the recommended route?`;
}

function buildWhyThisRoute(route: RoutePlan): string[] {
  const reasons: string[] = [];
  if (route.reason) {
    reasons.push(route.reason);
  }
  if (route.avoidedHazards && route.avoidedHazards.length > 0) {
    reasons.push(`Avoids ${route.avoidedHazards.join(" and ")}.`);
  }
  if (route.risk.level === "low") {
    reasons.push("Acceptable travel time for a low-risk corridor.");
  } else if (route.risk.score <= 45) {
    reasons.push("Acceptable travel time for the current risk level.");
  }
  return reasons;
}

export default function RoutePage({ embedded = false }: { embedded?: boolean }) {
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
    dataSource,
  } = useRoute();

  const pendingRoute = useAppStore((state) => state.pendingRoute);
  const clearPendingRoute = useAppStore((state) => state.clearPendingRoute);

  const [originLabel, setOriginLabel] = useState("");
  const [destinationLabel, setDestinationLabel] = useState("");
  const [hasCalculated, setHasCalculated] = useState(false);

  const routeList = useMemo(() => routes ?? [], [routes]);
  const marineAreas = useMemo(() => getMarineAreas(), []);

  const locationOptions = useMemo<NamedPoint[]>(() => {
    const map = new Map<string, NamedPoint>();

    for (const area of marineAreas) {
      map.set(area.name, {
        label: area.name,
        latitude: area.coordinates.latitude,
        longitude: area.coordinates.longitude,
      });
    }

    for (const route of routeList) {
      const origin =
        route.origin.name ?? `${route.origin.latitude}, ${route.origin.longitude}`;
      const destination =
        route.destination.name ?? `${route.destination.latitude}, ${route.destination.longitude}`;

      map.set(origin, {
        label: origin,
        latitude: route.origin.latitude,
        longitude: route.origin.longitude,
      });

      map.set(destination, {
        label: destination,
        latitude: route.destination.latitude,
        longitude: route.destination.longitude,
      });
    }

    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [routeList, marineAreas]);

  const displayedOptions = useMemo(() => {
    if (routeOptions.length > 0) return routeOptions;
    return routeList;
  }, [routeOptions, routeList]);

  const selected = selectedRoute ?? displayedOptions[0] ?? routeList[0] ?? null;
  const safestOption = displayedOptions[0] ?? null;
  const journey = useJourneySimulation(selected);

  useEffect(() => {
    if (pendingRoute) {
      selectRoute(pendingRoute);
      setHasCalculated(true);
      clearPendingRoute();
    }
  }, [pendingRoute, selectRoute, clearPendingRoute]);

  const handleCalculate = async () => {
    const origin = locationOptions.find((item) => item.label === originLabel);
    const destination = locationOptions.find((item) => item.label === destinationLabel);

    if (!origin || !destination) return;

    journey.stop();
    const calculated = await calculate(
      { latitude: origin.latitude, longitude: origin.longitude },
      { latitude: destination.latitude, longitude: destination.longitude }
    );

    if (calculated) {
      setHasCalculated(true);
    }
  };

  const handleSelectRouteId = (routeId: string) => {
    const found =
      displayedOptions.find((route) => route.id === routeId) ??
      routeList.find((route) => route.id === routeId);

    if (found) {
      journey.stop();
      selectRoute(found);
    }
  };

  const wrapPage = (content: ReactNode) =>
    embedded ? (
      <div className="route-page panel-page-full">{content}</div>
    ) : (
      <AppShell>
        <PageContainer className="route-page" fullHeight>{content}</PageContainer>
      </AppShell>
    );

  if (loading && !selected) {
    return wrapPage(
      <div className="route-loading">
        <LoadingState label="Analyzing optimal marine routes..." />
      </div>
    );
  }

  if (error && !selected) {
    return wrapPage(
      <ErrorState
        title="Route analysis unavailable"
        message={error}
        retry={refresh}
      />
    );
  }

  if (!selected) {
    return wrapPage(
      <EmptyState
        icon={RouteIcon}
        title="No passage routes available"
        description="No active marine routes found for the current configuration."
        action={{
          label: "Refresh routes",
          onClick: refresh,
        }}
      />
    );
  }

  const whyThisRoute = buildWhyThisRoute(selected);

  return (
    <AppShell>
      <PageContainer className="route-page" fullHeight>
        <div className="route-layout">
          {/* MAIN PLANNING AREA */}
          <main className="route-main">
            <header className="route-header">
              <div className="route-header-title">
                <div className="route-eyebrow">
                  <RouteIcon size={14} />
                  <span>Navigation Intelligence</span>
                </div>
                <h1>Route Planning</h1>
                <p>
                  Evaluate safer passage corridors dynamically balanced against active marine hazards and travel time.
                </p>
                {dataSource === "offline" && (
                  <span className="route-offline-badge">
                    <WifiOff size={11} />
                    Offline · showing local prototype data
                  </span>
                )}
              </div>

              <div className="route-header-actions">
                <Button variant="secondary" size="sm" onClick={refresh} disabled={loading}>
                  Refresh
                </Button>
                <Button variant="primary" size="sm" onClick={() => navigate(ROUTES.MAP)}>
                  <Navigation size={14} />
                  Full map
                </Button>
              </div>
            </header>

            {/* ORIGIN & DESTINATION SELECTOR */}
            <section className="route-planner-bar">
              <div className="route-planner-field">
                <label htmlFor="origin-select">Origin Port / Point</label>
                <select
                  id="origin-select"
                  value={originLabel}
                  onChange={(event) => setOriginLabel(event.target.value)}
                >
                  <option value="">Select departure point</option>
                  {locationOptions.map((item) => (
                    <option key={item.label} value={item.label}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <ArrowRight size={16} className="route-planner-arrow" />

              <div className="route-planner-field">
                <label htmlFor="dest-select">Destination</label>
                <select
                  id="dest-select"
                  value={destinationLabel}
                  onChange={(event) => setDestinationLabel(event.target.value)}
                >
                  <option value="">Select arrival destination</option>
                  {locationOptions.map((item) => (
                    <option key={item.label} value={item.label}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                variant="primary"
                size="sm"
                className="route-calc-btn"
                disabled={!originLabel || !destinationLabel || loading}
                onClick={handleCalculate}
              >
                {loading ? "Calculating..." : "Plan route"}
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
                  <span>Recommended Passage</span>
                  <strong>{safestOption.name}</strong>
                  <p>
                    Risk {safestOption.risk.score}/100 · {safestOption.distanceKm.toFixed(1)} km ·{" "}
                    {formatDuration(safestOption.estimatedDurationHours)} · {safestOption.reason}
                  </p>
                </div>
              </section>
            )}

            {/* MAP VIEWPORT */}
            <section className="route-map-card">
              <div className="route-map">
                <MarineMap
                  overrideRoutes={displayedOptions}
                  selectedRouteId={selected.id}
                  onSelectRoute={handleSelectRouteId}
                  startPoint={selected.origin}
                  endPoint={selected.destination}
                  journeyPosition={journey.position}
                  journeyBearingDeg={journey.bearingDeg}
                  offline={dataSource === "offline"}
                />
              </div>

              <footer className="route-map-footer">
                <div className="route-endpoint">
                  <span className="route-endpoint-dot start" />
                  <div>
                    <span>Origin</span>
                    <strong>{selected.origin.name}</strong>
                  </div>
                </div>

                <ArrowRight size={14} className="route-direction" />

                <div className="route-endpoint">
                  <span className="route-endpoint-dot end" />
                  <div>
                    <span>Destination</span>
                    <strong>{selected.destination.name}</strong>
                  </div>
                </div>
              </footer>
            </section>

            {/* ROUTE CARDS GRID */}
            <section className="route-options-section">
              <div className="route-section-header">
                <div>
                  <span className="route-sub">
                    {hasCalculated ? "Computed Routes" : "Standard Corridors"}
                  </span>
                  <h2>Available Passages</h2>
                </div>
                <span className="route-count">{displayedOptions.length} routes</span>
              </div>

              <div className="route-options">
                {displayedOptions.map((route, index) => {
                  const isSelected = route.id === selected.id;
                  const label = optionLabel(route, index);

                  return (
                    <button
                      key={route.id}
                      type="button"
                      className={`route-option ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        journey.stop();
                        selectRoute(route);
                      }}
                    >
                      <div className="route-option-top">
                        <div className="route-option-name">
                          <span className={`route-radio ${isSelected ? "active" : ""}`} />
                          <strong>{route.name}</strong>
                        </div>
                        <Badge tone={optionLabelTone(label)} size="sm">
                          {label}
                        </Badge>
                      </div>

                      <div className="route-option-stats">
                        <span>{route.distanceKm.toFixed(1)} km</span>
                        <span>·</span>
                        <span>{formatDuration(route.estimatedDurationHours)}</span>
                        <span>·</span>
                        <span>Risk {route.risk.score}/100</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </main>

          {/* SIDEBAR ANALYSIS PANEL */}
          <aside className="route-sidebar">
            <section className="route-panel">
              <div className="route-panel-heading">
                <div>
                  <span className="route-panel-sub">Selected Route</span>
                  <h2>{selected.name}</h2>
                </div>
                <Badge tone={routeDecisionTone(selected.routeDecision)} size="sm">
                  {selected.routeDecision.toUpperCase()}
                </Badge>
              </div>

              <div className="route-summary-stats">
                <div className="route-stat-box">
                  <Navigation size={15} />
                  <span>Distance</span>
                  <strong>{selected.distanceKm.toFixed(1)} km</strong>
                </div>

                <div className="route-stat-box">
                  <Clock3 size={15} />
                  <span>Est. Time</span>
                  <strong>{formatDuration(selected.estimatedDurationHours)}</strong>
                </div>

                <div className="route-stat-box">
                  <ShieldAlert size={15} />
                  <span>Risk Score</span>
                  <strong>{selected.risk.score}/100</strong>
                </div>

                <div className="route-stat-box">
                  <Navigation size={15} />
                  <span>Safe Speed</span>
                  <strong>{selected.recommendedSpeedKnots} kn</strong>
                </div>
              </div>

              <div className="route-risk-block">
                <div className="route-risk-heading">
                  <span>Marine Risk Level</span>
                  <Badge tone={riskTone(selected.risk.level)} size="sm">
                    {selected.risk.level.toUpperCase()}
                  </Badge>
                </div>
                <div className="route-risk-bar">
                  <span
                    className={`risk-${selected.risk.level.toLowerCase()}`}
                    style={{
                      width: `${Math.min(100, Math.max(0, selected.risk.score))}%`,
                    }}
                  />
                </div>
              </div>

              <div className="route-reason">
                <Sparkles size={16} />
                <div>
                  <span>Route Justification</span>
                  <ul className="route-why-list">
                    {whyThisRoute.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <AskSagarButton
                prompt={buildAskSagarPrompt(selected, marineAreas)}
                label="Ask Sagar about this route"
                fullWidth
                className="route-ask-sagar-btn"
              />
            </section>

            {/* DEMO SIMULATION */}
            <section className="route-panel route-journey-panel">
              <div className="route-panel-heading">
                <div>
                  <span className="route-panel-sub">Simulation Demo</span>
                  <h2>Virtual Passage</h2>
                </div>
              </div>

              <p className="route-journey-disclaimer">
                Simulated corridor validation demo. Real-time telemetry & AIS tracking disabled.
              </p>

              {journey.status === "idle" ? (
                <Button variant="secondary" size="sm" fullWidth onClick={journey.start}>
                  <Play size={14} />
                  Simulate passage
                </Button>
              ) : (
                <div className="route-journey-progress">
                  <div className="route-journey-meta">
                    <span>From: {selected.origin.name}</span>
                    <span>To: {selected.destination.name}</span>
                  </div>

                  <div className="route-risk-bar">
                    <span
                      className="risk-low"
                      style={{ width: `${Math.round(journey.progress * 100)}%` }}
                    />
                  </div>

                  <div className="route-journey-stats">
                    <span>Progress: {Math.round(journey.progress * 100)}%</span>
                    <span>ETA: {journey.etaMinutesRemaining ?? "—"} min</span>
                  </div>

                  <div className="route-journey-controls">
                    {journey.status === "running" && (
                      <Button variant="secondary" size="sm" onClick={journey.pause}>
                        <Pause size={14} /> Pause
                      </Button>
                    )}
                    {journey.status === "paused" && (
                      <Button variant="secondary" size="sm" onClick={journey.resume}>
                        <Play size={14} /> Resume
                      </Button>
                    )}
                    {journey.status === "finished" && (
                      <Button variant="secondary" size="sm" onClick={journey.start}>
                        <Play size={14} /> Replay
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={journey.stop}>
                      <Square size={14} /> Stop
                    </Button>
                  </div>
                </div>
              )}
            </section>

            {/* ENVIRONMENT CONDITIONS */}
            <section className="route-panel">
              <div className="route-panel-heading">
                <div>
                  <span className="route-panel-sub">Live Atmosphere</span>
                  <h2>Route Environment</h2>
                </div>
              </div>

              <div className="route-condition-list">
                <div className="route-condition">
                  <Wind size={15} />
                  <div>
                    <span>Wind Force</span>
                    <strong>{selected.conditions.wind}</strong>
                  </div>
                </div>
                <div className="route-condition">
                  <Waves size={15} />
                  <div>
                    <span>Sea Waves</span>
                    <strong>{selected.conditions.waves}</strong>
                  </div>
                </div>
                <div className="route-condition">
                  <MapPin size={15} />
                  <div>
                    <span>Visibility</span>
                    <strong>{selected.conditions.visibility}</strong>
                  </div>
                </div>
              </div>
            </section>

            {/* RESTRICTIONS & HAZARDS */}
            <section className="route-panel">
              <div className="route-panel-heading">
                <div>
                  <span className="route-panel-sub">Safety Checks</span>
                  <h2>Hazards Avoided</h2>
                </div>
              </div>

              {selected.avoidedHazards?.length ? (
                <div className="route-hazards">
                  {selected.avoidedHazards.map((hazard) => (
                    <div key={hazard} className="route-hazard">
                      <CheckCircle2 size={14} />
                      <span>{hazard}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="route-no-hazards">
                  <CheckCircle2 size={15} />
                  <span>Clear passage without reported environmental hazards.</span>
                </div>
              )}

              {selected.routeDecision === "blocked" && (
                <div className="route-blocked">
                  <XCircle size={16} />
                  <div>
                    <strong>Corridor Blocked</strong>
                    <span>Passage restricted due to active perimeter advisories.</span>
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