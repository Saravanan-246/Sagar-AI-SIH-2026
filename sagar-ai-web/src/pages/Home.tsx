import {
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  Bot,
  Cloud,
  Compass,
  Fish,
  FlaskConical,
  History,
  LocateFixed,
  Map as MapIcon,
  Mic,
  Navigation,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Thermometer,
  Waves,
  Wind,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import ChatMapPanel from "../components/chat/ChatMapPanel";
import MarineConditionsPanel from "../components/marine/MarineConditionsPanel";
import FreshnessBadge from "../components/marine/FreshnessBadge";
import { ROUTES } from "../constants/routes";
import { useConnectivity } from "../hooks/useConnectivity";
import { useMarineConditions } from "../hooks/useMarineConditions";
import { useMarineData } from "../hooks/useMarineData";
import { useAlerts } from "../hooks/useAlerts";
import { useAreaRisk } from "../hooks/useAreaRisk";
import { useUserLocation } from "../hooks/useUserLocation";
import { useVoiceInput } from "../hooks/useVoiceInput";
import { describeRiskBasis } from "../utils/riskBasis";
import { useAppStore } from "../store/appStore";
import { alertTypeIcon, formatAlertType } from "../utils/alertPresentation";
import { haversineDistanceKm } from "../utils/geo";
import { micLabelsFor } from "../utils/voiceLabels";
import { recognitionLocaleFor } from "../utils/voiceLocale";
import { getRoutes } from "../services/routes/routeService";
import type { ChatMapFocus } from "../utils/chatMapFocus";
import type { MarineArea } from "../types/marine";

import "./Home.css";

type Severity = "low" | "moderate" | "high" | "critical";

type PromptKey = "sea" | "route" | "zones" | "routeAlerts" | "why" | "decision";

const PROMPT_ICONS: Record<PromptKey, typeof ShieldAlert> = {
  sea: Waves,
  route: Navigation,
  zones: Fish,
  routeAlerts: AlertTriangle,
  why: ShieldAlert,
  decision: History,
};

/*
 * Starter questions in the user's app language. Each is sent through
 * Chat's normal pipeline exactly as if typed - the backend detects the
 * language from the text and answers from real data, so a Tamil chip
 * gets a Tamil answer. Wording is chosen to match the backend's intent
 * rules in each language (see sagar-ai-server intent.ts).
 */
const ASK_SAGAR_PROMPTS: Record<"en" | "ta" | "hi", Record<PromptKey, string>> = {
  en: {
    sea: "How is the sea today?",
    route: "Is my route safe?",
    zones: "Show fishing zones nearby",
    routeAlerts: "Any alerts on my route?",
    why: "Why is this area risky?",
    decision: "What changed since my last decision?",
  },
  ta: {
    sea: "இன்று கடல் நிலைமை எப்படி இருக்கு?",
    route: "என் route பாதுகாப்பானதா?",
    zones: "அருகில் உள்ள மீன்பிடி பகுதிகளைக் காட்டு",
    routeAlerts: "என் route-ல் எச்சரிக்கை ஏதாவது உள்ளதா?",
    why: "இந்தப் பகுதி ஏன் ஆபத்தானது?",
    decision: "என் கடைசி முடிவுக்குப் பிறகு என்ன மாறியது?",
  },
  hi: {
    sea: "आज समुद्र की स्थिति कैसी है?",
    route: "क्या मेरा रूट सुरक्षित है?",
    zones: "पास के मछली पकड़ने के क्षेत्र दिखाओ",
    routeAlerts: "क्या मेरे रूट पर कोई चेतावनी है?",
    why: "यह क्षेत्र खतरनाक क्यों है?",
    decision: "मेरे पिछले निर्णय के बाद क्या बदला?",
  },
};

/** Beyond this, device coordinates are outside every configured area
 * (matches the backend's COVERAGE_RADIUS_KM). */
const COVERAGE_RADIUS_KM = 250;

type AreaBasis = "selected" | "device" | "outside" | "default";

/**
 * Which configured area Home describes: the area the user picked, else
 * the one nearest their device location (when inside coverage), else
 * the default. Never snaps an out-of-coverage position to an area.
 */
function pickHomeArea(
  areas: MarineArea[],
  fallback: MarineArea | null,
  selectedAreaId: string | null,
  location: { latitude: number; longitude: number } | null
): { area: MarineArea | null; basis: AreaBasis } {
  const selected = selectedAreaId ? areas.find((item) => item.id === selectedAreaId) : undefined;
  if (selected) return { area: selected, basis: "selected" };

  if (location) {
    const nearest = areas
      .filter((item) => item.coordinates)
      .map((item) => ({ item, km: haversineDistanceKm(location, item.coordinates) }))
      .sort((a, b) => a.km - b.km)[0];

    if (nearest && nearest.km <= COVERAGE_RADIUS_KM) {
      return { area: nearest.item, basis: "device" };
    }
    return { area: fallback, basis: "outside" };
  }

  return { area: fallback, basis: "default" };
}

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
  const appLanguage = useAppStore((state) => state.language);
  const voiceLanguageOverride = useAppStore((state) => state.voiceLanguageOverride);
  const selectedAreaId = useAppStore((state) => state.selectedAreaId);
  const currentLocation = useAppStore((state) => state.currentLocation);
  const locationPermission = useAppStore((state) => state.locationPermission);
  const { requestLocation, status: locationStatus } = useUserLocation();

  const {
    areas,
    area: defaultArea,
    loading,
    origin,
    error: marineError,
  } = useMarineData();

  const { area, basis: areaBasis } = useMemo(
    () => pickHomeArea(areas, defaultArea, selectedAreaId, currentLocation),
    [areas, defaultArea, selectedAreaId, currentLocation]
  );
  const connectivity = useConnectivity();
  const offline = connectivity.status === "offline";
  const conditions = useMarineConditions(area, { offline });
  const { alerts, loading: alertsLoading } = useAlerts({ areaId: area?.id });

  const { risk: liveRisk, status: riskStatus } = useAreaRisk(area?.id, conditions.validAt);
  const riskServiceFailed = riskStatus === "failed";
  const riskBasis = describeRiskBasis(liveRisk?.basis, {
    loading: riskStatus === "loading" || riskStatus === "idle",
    serviceFailed: riskServiceFailed,
  });

  const marineRisk =
    liveRisk?.riskLevel ?? (riskServiceFailed ? area?.safety?.overallRisk : null) ?? null;
  const riskScore =
    liveRisk?.riskScore ?? (riskServiceFailed ? area?.safety?.riskScore : null) ?? null;
  const seaState = area?.conditions?.seaState
    ? area.conditions.seaState
        .replaceAll("_", " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "—";

  const modelWave = conditions.readings?.waveHeight;
  const modelWind = conditions.readings?.wind;
  const modelSst = conditions.readings?.seaSurfaceTemperature;

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

  /*
   * Hands the question to Chat with the context Home is showing - the
   * area and nearby route - so Chat answers about what the user is
   * looking at. Chat sends it through its normal pipeline; the backend
   * uses the route only when the question is about a route.
   */
  const handleAskSagar = (question: string, options: { spoken?: boolean } = {}) => {
    const text = question.trim();
    if (!text) return;

    setPendingChatPrompt({
      text,
      areaId: area?.id,
      routeId: route?.id,
      spoken: options.spoken,
    });
    navigate(ROUTES.CHAT);
  };

  const [draft, setDraft] = useState("");

  // The mic listens in the chosen voice language, else the app language.
  const voiceLanguage = voiceLanguageOverride !== "auto" ? voiceLanguageOverride : appLanguage;
  const micLabels = micLabelsFor(voiceLanguage);

  const voiceInput = useVoiceInput({
    language: recognitionLocaleFor(voiceLanguage),
    onResult: (transcript) => handleAskSagar(transcript, { spoken: true }),
  });

  // Live interim words in the box while the user is speaking.
  useEffect(() => {
    if (voiceInput.status === "listening" && voiceInput.interimTranscript) {
      setDraft(voiceInput.interimTranscript);
    }
  }, [voiceInput.status, voiceInput.interimTranscript]);

  const isListening = voiceInput.status === "listening";

  const handleMicPress = () => {
    if (isListening) {
      voiceInput.stop();
      return;
    }
    voiceInput.retry();
  };

  const voiceStatusText =
    voiceInput.status === "error"
      ? micLabels.errors[voiceInput.errorReason ?? "unknown"]
      : voiceInput.status === "listening" ||
          voiceInput.status === "processing" ||
          voiceInput.status === "ready"
        ? micLabels[voiceInput.status]
        : null;

  const prompts = ASK_SAGAR_PROMPTS[appLanguage === "ta" || appLanguage === "hi" ? appLanguage : "en"];

  // Map-first: the area Home describes, its nearby route and its alerts.
  const mapFocus = useMemo<ChatMapFocus | null>(() => {
    if (!area?.coordinates) return null;
    return {
      kind: "area",
      center: area.coordinates,
      zoom: 9,
      highlight: { ...area.coordinates, label: area.name },
      areaName: area.name,
      route,
      alerts,
    };
  }, [area, route, alerts]);

  const sagarStatus =
    connectivity.status === "offline"
      ? { label: "Offline", tone: "offline" }
      : connectivity.status === "degraded"
        ? { label: "Limited", tone: "degraded" }
        : { label: "Ready", tone: "ready" };

  const locationNote =
    areaBasis === "device"
      ? "Nearest area to your location"
      : areaBasis === "selected"
        ? "Selected area"
        : areaBasis === "outside"
          ? "Your location is outside Sagar's coverage - showing the default area"
          : null;

  return (
    <AppShell>
      <PageContainer className="home-page">
        <div className="home-layout">
          {/* MARINE MAP - the area, its nearby route and active alerts */}
          <section className="home-map-card" aria-label="Marine map">
            <div className="home-map-canvas">
              {mapFocus ? (
                <ChatMapPanel variant="inline" focus={mapFocus} areas={areas} />
              ) : (
                <div className="home-map-placeholder">
                  {loading ? "Loading map…" : "Map unavailable - no marine area loaded."}
                </div>
              )}
            </div>
            <div className="home-map-footer">
              <span className="home-map-caption">
                {route ? `Route in view: ${route.name}` : "Tap Open Marine Map for layers, zones and routes"}
              </span>
              <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.MAP)}>
                <MapIcon size={14} />
                Open Marine Map
              </Button>
            </div>
          </section>

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
            {area && (
              <div className="home-location-row">
                {locationNote && (
                  <span className="home-location-note">
                    <LocateFixed size={12} />
                    {locationNote}
                  </span>
                )}
                {!currentLocation && locationPermission !== "denied" && locationPermission !== "unavailable" && (
                  <button
                    type="button"
                    className="home-location-button"
                    onClick={() => void requestLocation()}
                    disabled={locationStatus === "requesting"}
                  >
                    <LocateFixed size={12} />
                    {locationStatus === "requesting" ? "Locating…" : "Use my location"}
                  </button>
                )}
              </div>
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

          </Card>

          {/* ASK SAGAR */}
          <Card className="home-ask-card" padding="lg">
            <header className="home-sagar-header">
              <div className="home-sagar-profile">
                <div className="home-sagar-avatar">
                  <Bot size={20} />
                </div>
                <div>
                  <div className="home-sagar-title-row">
                    <h2>Ask Sagar</h2>
                    <span className={`home-sagar-status is-${sagarStatus.tone}`}>
                      <i />
                      {sagarStatus.label}
                    </span>
                  </div>
                  <p>
                    Type or speak in English, தமிழ், हिन्दी, Tanglish or Hinglish
                    {area ? ` - answers use ${area.name}` : ""}.
                  </p>
                </div>
              </div>

              <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.CHAT)}>
                Open chat
                <ArrowRight size={14} />
              </Button>
            </header>

            <form
              className="home-sagar-composer"
              onSubmit={(event) => {
                event.preventDefault();
                handleAskSagar(draft);
              }}
            >
              <Sparkles size={16} />
              <input
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ask about the sea, your route, alerts or fishing zones…"
                aria-label="Ask Sagar"
                enterKeyHint="send"
                autoComplete="off"
              />
              {/* Always shown: where voice can't work (http page, no
                  SpeechRecognition) the tap explains why below instead
                  of the mic silently disappearing. */}
              <button
                type="button"
                className={`home-sagar-icon-button ${isListening ? "is-listening" : ""} ${voiceInput.isSupported ? "" : "is-unavailable"}`}
                onClick={handleMicPress}
                aria-label={isListening ? micLabels.stop : micLabels.idle}
                aria-pressed={isListening}
                title={`${isListening ? micLabels.stop : micLabels.idle} (${voiceLanguage.toUpperCase()})`}
              >
                {isListening ? <Square size={14} /> : <Mic size={16} />}
              </button>
              <button
                type="submit"
                className="home-sagar-icon-button home-sagar-send"
                disabled={!draft.trim()}
                aria-label="Ask Sagar"
              >
                <ArrowUp size={16} />
              </button>
            </form>

            {voiceStatusText && (
              <div
                className={`home-voice-status ${voiceInput.status === "error" ? "is-error" : ""}`}
                role="status"
                aria-live="polite"
              >
                <i aria-hidden="true" />
                <span>{voiceStatusText}</span>
              </div>
            )}

            <div className="home-sagar-suggestions">
              {(Object.keys(prompts) as PromptKey[]).map((key) => {
                const Icon = PROMPT_ICONS[key];
                return (
                  <button key={key} type="button" onClick={() => handleAskSagar(prompts[key])}>
                    <Icon size={14} />
                    <span>{prompts[key]}</span>
                  </button>
                );
              })}
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

          {/* MARINE CONDITIONS */}
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