import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Cloud,
  Compass,
  Fish,
  FlaskConical,
  Map as MapIcon,
  Navigation,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Thermometer,
  Waves,
  Wind,
} from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import MarineConditionsPanel from "../components/marine/MarineConditionsPanel";
import FreshnessBadge from "../components/marine/FreshnessBadge";
import { ROUTES } from "../constants/routes";
import { useConnectivity } from "../hooks/useConnectivity";
import { useMarineConditions } from "../hooks/useMarineConditions";
import { useMarineData } from "../hooks/useMarineData";
import { useAlerts } from "../hooks/useAlerts";
import { useAreaRisk } from "../hooks/useAreaRisk";
import { describeRiskBasis } from "../utils/riskBasis";
import { useAppStore } from "../store/appStore";
import { alertTypeIcon, formatAlertType } from "../utils/alertPresentation";
import { haversineDistanceKm } from "../utils/geo";
import { getRoutes } from "../services/routes/routeService";
import type { MarineArea } from "../types/marine";

import "./Home.css";

type Severity = "low" | "moderate" | "high" | "critical";

const ASK_SAGAR_PROMPTS: Array<{ icon: typeof ShieldAlert; label: string }> = [
  { icon: ShieldAlert, label: "Is it safe to fish right now?" },
  { icon: Waves, label: "What is changing in the sea?" },
  { icon: Fish, label: "Which fishing zone should I inspect?" },
  { icon: Navigation, label: "Find a safer route" },
  { icon: AlertTriangle, label: "Why is the risk high?" },
];

const COMPASS_ABBREVIATIONS: Record<string, string> = {
  north: "N",
  "north-east": "NE",
  east: "E",
  "south-east": "SE",
  south: "S",
  "south-west": "SW",
  west: "W",
  "north-west": "NW",
};

function abbreviateDirection(direction?: string): string {
  if (!direction) return "";
  return COMPASS_ABBREVIATIONS[direction.toLowerCase()] ?? direction;
}

function formatCoordinates(latitude: number, longitude: number): string {
  const lat = `${Math.abs(latitude).toFixed(3)}°${latitude >= 0 ? "N" : "S"}`;
  const lng = `${Math.abs(longitude).toFixed(3)}°${longitude >= 0 ? "E" : "W"}`;
  return `${lat}, ${lng}`;
}

// Plain weather description from the configured cloud cover / rain
// probability - the same area profile the sea state comes from.
function describeWeather(area: MarineArea | null): string | null {
  const conditions = area?.conditions;
  if (!conditions) return null;
  const { cloudCover, rainProbability } = conditions;
  if (typeof rainProbability === "number" && rainProbability >= 60) return "Rain likely";
  if (typeof rainProbability === "number" && rainProbability >= 40) return "Showers possible";
  if (typeof cloudCover !== "number") return null;
  if (cloudCover >= 70) return "Overcast";
  if (cloudCover >= 30) return "Partly cloudy";
  return "Clear";
}

// Lowest-risk configured route departing near this area - null when no
// route starts within reach, rather than borrowing one from elsewhere.
const ROUTE_ORIGIN_MAX_KM = 25;

function nearestRoute(area: MarineArea | null) {
  if (!area?.coordinates) return null;
  return (
    getRoutes()
      .filter((route) => haversineDistanceKm(route.origin, area.coordinates) <= ROUTE_ORIGIN_MAX_KM)
      .sort((a, b) => a.risk.score - b.risk.score)[0] ?? null
  );
}

export default function Home() {
  const navigate = useNavigate();
  const setPendingChatPrompt = useAppStore((state) => state.setPendingChatPrompt);

  const { area, loading, origin, error: marineError } = useMarineData();
  const connectivity = useConnectivity();
  const offline = connectivity.status === "offline";
  const conditions = useMarineConditions(area, { offline });
  // Scoped to the resolved area, same as Map.tsx - never the unscoped
  // "every alert nationwide" fallback, which could otherwise surface an
  // unrelated hazard (e.g. a Chennai alert) on this area's safety card.
  const { alerts, loading: alertsLoading } = useAlerts({ areaId: area?.id });

  // The same backend risk result Chat uses (/api/risk), recalculated
  // whenever the displayed model run changes so the risk and the
  // conditions shown below come from the same data. Only if the risk
  // service fails does the page fall back to the area's pre-set
  // prototype score - labelled as such via riskBasis.
  const { risk: liveRisk, status: riskStatus } = useAreaRisk(area?.id, conditions.validAt);
  const riskServiceFailed = riskStatus === "failed";
  const riskBasis = describeRiskBasis(liveRisk?.basis, {
    loading: riskStatus === "loading" || riskStatus === "idle",
    serviceFailed: riskServiceFailed,
  });

  // No invented defaults: when there is no area/risk, say so ("—")
  // rather than showing a plausible-looking number.
  const marineRisk =
    liveRisk?.riskLevel ?? (riskServiceFailed ? area?.safety?.overallRisk : null) ?? null;
  const riskScore =
    liveRisk?.riskScore ?? (riskServiceFailed ? area?.safety?.riskScore : null) ?? null;
  const seaState = area?.conditions?.seaState
    ? area.conditions.seaState
        .replaceAll("_", " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "—";

  // Wave/wind come from the Open-Meteo model reading only - the
  // configured prototype values are shown separately and labelled.
  const modelWave = conditions.readings?.waveHeight;
  const modelWind = conditions.readings?.wind;
  const modelSst = conditions.readings?.seaSurfaceTemperature;

  // Once the model has settled without a value, fall back to the
  // configured area profile - badged FALLBACK, never shown as model data.
  const modelSettled = conditions.status !== "loading";
  const profileWind =
    !modelWind && modelSettled && typeof area?.conditions?.windSpeedKnots === "number"
      ? area.conditions
      : null;
  const profileWave =
    !modelWave && modelSettled && typeof area?.conditions?.waveHeightM === "number"
      ? area.conditions.waveHeightM
      : null;
  const profileSst =
    !modelSst && modelSettled && typeof area?.marineIndicators?.seaSurfaceTemperatureC === "number"
      ? area.marineIndicators.seaSurfaceTemperatureC
      : null;
  const weather = describeWeather(area);
  const route = useMemo(() => nearestRoute(area), [area]);

  const getRiskTone = (risk: string): "success" | "warning" | "danger" | "neutral" => {
    switch (risk.toLowerCase()) {
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
  };

  const topAlerts = useMemo(() => {
    const priority: Record<Severity, number> = { critical: 4, high: 3, moderate: 2, low: 1 };
    return [...alerts]
      .sort((a, b) => {
        const severityA = (a.severity as Severity) ?? "low";
        const severityB = (b.severity as Severity) ?? "low";
        return (priority[severityB] ?? 0) - (priority[severityA] ?? 0);
      })
      .slice(0, 3);
  }, [alerts]);

  const handleAskSagar = (prompt: string) => {
    setPendingChatPrompt(prompt);
    navigate(ROUTES.CHAT);
  };

  return (
    <AppShell>
      <PageContainer className="home-page">
        <div className="home-layout">
          {/* CURRENT MARINE SITUATION */}
          <Card className="home-situation-card" padding="lg">
            <div className="home-situation-top">
              <div className="home-eyebrow">
                <Waves size={15} />
                <span>Marine Status</span>
              </div>
              {marineRisk && (
                <Badge tone={getRiskTone(marineRisk)} size="sm">
                  {marineRisk.toUpperCase()}
                </Badge>
              )}
            </div>

            <h1 className="home-situation-title">
              {loading ? "Loading conditions…" : area?.name ?? "Marine data unavailable"}
            </h1>
            {area && (
              <p className="home-situation-region">
                {[area.region, formatCoordinates(area.coordinates.latitude, area.coordinates.longitude)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {!loading && !area && (
              <p className="home-situation-region">
                {marineError ?? "No configured marine area could be loaded."}
              </p>
            )}

            <div className="home-situation-risk">
              <span className="home-situation-risk-score">{riskScore ?? "—"}</span>
              <span className="home-situation-risk-label">/100 risk score</span>
            </div>
            {area && (
              <p className="home-situation-source">
                <FreshnessBadge state={riskBasis.state} /> {riskBasis.text}
              </p>
            )}

            <div className="home-situation-conditions">
              <div className="home-situation-condition">
                <Waves size={14} />
                <span>Sea state</span>
                <strong>{seaState}</strong>
                {area?.conditions?.seaState && <FreshnessBadge state="FALLBACK" />}
              </div>
              <div className="home-situation-condition">
                <Wind size={14} />
                <span>Wind</span>
                <strong>
                  {typeof modelWind?.value === "number"
                    ? `${modelWind.value} kn`
                    : profileWind
                      ? `${profileWind.windSpeedKnots} kn ${abbreviateDirection(profileWind.windDirection)}`.trim()
                      : "—"}
                </strong>
                {modelWind ? (
                  <FreshnessBadge state={modelWind.state} />
                ) : (
                  profileWind && <FreshnessBadge state="FALLBACK" />
                )}
              </div>
              <div className="home-situation-condition">
                <Waves size={14} />
                <span>Waves</span>
                <strong>
                  {typeof modelWave?.value === "number"
                    ? `${modelWave.value.toFixed(1)} m`
                    : profileWave !== null
                      ? `${profileWave.toFixed(1)} m`
                      : "—"}
                </strong>
                {modelWave ? (
                  <FreshnessBadge state={modelWave.state} />
                ) : (
                  profileWave !== null && <FreshnessBadge state="FALLBACK" />
                )}
              </div>
              <div className="home-situation-condition">
                <Thermometer size={14} />
                <span>Sea temp</span>
                <strong>
                  {typeof modelSst?.value === "number"
                    ? `${modelSst.value.toFixed(1)} °C`
                    : profileSst !== null
                      ? `${profileSst.toFixed(1)} °C`
                      : "—"}
                </strong>
                {modelSst ? (
                  <FreshnessBadge state={modelSst.state} />
                ) : (
                  profileSst !== null && <FreshnessBadge state="FALLBACK" />
                )}
              </div>
              <div className="home-situation-condition">
                <Cloud size={14} />
                <span>Weather</span>
                <strong>{weather ?? "—"}</strong>
                {weather && <FreshnessBadge state="FALLBACK" />}
              </div>
              <div className="home-situation-condition" title={route?.name}>
                <Navigation size={14} />
                <span>Route status</span>
                <strong>
                  {route ? route.status.charAt(0).toUpperCase() + route.status.slice(1) : "—"}
                </strong>
                {route && <FreshnessBadge state="FALLBACK" />}
              </div>
            </div>

            <Button variant="secondary" fullWidth onClick={() => navigate(ROUTES.MAP)}>
              <MapIcon size={15} />
              Open Marine Map
            </Button>
          </Card>

          {/* ASK SAGAR - primary action */}
          <Card className="home-ask-card" padding="lg">
            <header className="home-sagar-header">
              <div className="home-sagar-profile">
                <div className="home-sagar-avatar">
                  <Bot size={20} />
                </div>
                <div>
                  <div className="home-sagar-title-row">
                    <h2>Ask Sagar</h2>
                    <span className="home-sagar-status">
                      <i />
                      Ready
                    </span>
                  </div>
                  <p>Sagar's marine reasoning assistant - routes, zones, risk, alerts.</p>
                </div>
              </div>

              <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.CHAT)}>
                Open chat
                <ArrowRight size={14} />
              </Button>
            </header>

            <button type="button" className="home-sagar-composer" onClick={() => navigate(ROUTES.CHAT)}>
              <Sparkles size={16} />
              <span>Ask Sagar about sea conditions, alerts, fishing zones or routes…</span>
            </button>

            <div className="home-sagar-suggestions">
              {ASK_SAGAR_PROMPTS.map(({ icon: Icon, label }) => (
                <button key={label} type="button" onClick={() => handleAskSagar(label)}>
                  <Icon size={14} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </Card>

          {/* SAFETY / ALERTS */}
          <Card className="home-safety-card" padding="lg">
            <header className="home-safety-header">
              <div className="home-safety-title-group">
                {topAlerts.length > 0 ? <ShieldAlert size={17} /> : <ShieldCheck size={17} />}
                <div>
                  <span className="home-eyebrow-plain">Safety</span>
                  <h2>Active Alerts</h2>
                </div>
              </div>
              {topAlerts.length > 0 && (
                <Badge tone="danger" size="sm">
                  {alerts.length}
                </Badge>
              )}
            </header>

            {alertsLoading ? (
              <div className="home-safety-loading">Loading alerts...</div>
            ) : topAlerts.length === 0 ? (
              <div className="home-safety-empty">
                <ShieldCheck size={18} />
                <div>
                  <strong>No active alerts</strong>
                  <span>No active hazards reported for this area.</span>
                </div>
              </div>
            ) : (
              <div className="home-safety-list">
                {topAlerts.map((alert) => {
                  const Icon = alertTypeIcon(alert.type);
                  return (
                    <button
                      key={alert.id}
                      type="button"
                      className="home-safety-item"
                      onClick={() => navigate(ROUTES.ALERTS)}
                    >
                      <div className={`home-safety-item-icon ${alert.severity ?? "low"}`}>
                        <Icon size={15} />
                      </div>
                      <div className="home-safety-item-content">
                        <strong>{alert.title}</strong>
                        <span>
                          {formatAlertType(alert.type)} &middot; {alert.location.name}
                        </span>
                      </div>
                      <ArrowRight size={14} />
                    </button>
                  );
                })}
              </div>
            )}

            <Button variant="ghost" size="sm" fullWidth onClick={() => navigate(ROUTES.ALERTS)}>
              View all alerts
              <ArrowRight size={14} />
            </Button>
          </Card>

          {/* MARINE CONDITIONS - model values with source / valid time /
              freshness, plus the configured profile clearly labelled */}
          <Card className="home-metrics-card" padding="lg">
            <MarineConditionsPanel
              area={area}
              conditions={conditions}
              offline={offline}
              title="Current conditions"
              origin={origin}
              riskBasis={liveRisk?.basis?.conditions ?? null}
            />
          </Card>

          {/* QUICK ACTIONS */}
          <section className="home-tools-section">
            <div className="home-tools-header">
              <span className="home-eyebrow-plain">Quick Access</span>
              <h2>Marine Tools</h2>
            </div>

            <div className="home-tools-grid">
              <button type="button" className="home-tool-card" onClick={() => navigate(ROUTES.ROUTE)}>
                <div className="home-tool-icon route">
                  <Navigation size={18} />
                </div>
                <div className="home-tool-info">
                  <strong>Route Planning</strong>
                  <span>Compare safer marine routes</span>
                </div>
                <ArrowRight size={16} />
              </button>

              <button type="button" className="home-tool-card" onClick={() => navigate(ROUTES.SCENARIO)}>
                <div className="home-tool-icon scenario">
                  <Compass size={18} />
                </div>
                <div className="home-tool-info">
                  <strong>What-If Analysis</strong>
                  <span>Test changing conditions</span>
                </div>
                <ArrowRight size={16} />
              </button>

              <button type="button" className="home-tool-card" onClick={() => navigate(ROUTES.MAP)}>
                <div className="home-tool-icon fishing">
                  <Fish size={18} />
                </div>
                <div className="home-tool-info">
                  <strong>Fishing Zones</strong>
                  <span>Configured PFZ recommendations</span>
                </div>
                <ArrowRight size={16} />
              </button>

              <button type="button" className="home-tool-card" onClick={() => navigate(ROUTES.SST_LAB)}>
                <div className="home-tool-icon sst">
                  <Thermometer size={18} />
                </div>
                <div className="home-tool-info">
                  <strong>SST Intelligence</strong>
                  <span>Sea-surface temperature research</span>
                </div>
                <ArrowRight size={16} />
              </button>

              <button type="button" className="home-tool-card" onClick={() => navigate(ROUTES.MARINE_LAB)}>
                <div className="home-tool-icon lab">
                  <FlaskConical size={18} />
                </div>
                <div className="home-tool-info">
                  <strong>Marine Intelligence Lab</strong>
                  <span>Evidence, validation &amp; sources</span>
                </div>
                <ArrowRight size={16} />
              </button>
            </div>
          </section>

          {/* RESEARCH / INTELLIGENCE */}
          <Card className="home-research-card" interactive onClick={() => navigate(ROUTES.MARINE_LAB)}>
            <div className="home-research-icon">
              <FlaskConical size={18} />
            </div>
            <div className="home-research-content">
              <strong>Marine Intelligence Lab</strong>
              <span>Research, validation and evidence for Sagar's marine reasoning system.</span>
            </div>
            <ArrowRight size={16} />
          </Card>
        </div>
      </PageContainer>
    </AppShell>
  );
}
