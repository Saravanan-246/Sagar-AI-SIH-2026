import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  CloudOff,
  Database,
  FileSearch,
  Layers3,
  RefreshCw,
  Satellite,
  Send,
  Sparkles,
  Thermometer,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import LoadingState from "../components/ui/LoadingState";
import AskSagarButton from "../components/chat/AskSagarButton";
import ChatMessage from "../components/chat/ChatMessage";
import EvidencePanel, {
  type EvidenceItem,
} from "../components/marine/EvidencePanel";
import RiskIndicator from "../components/marine/RiskIndicator";
import MarineMetric from "../components/marine/MarineMetric";

import useSagar from "../hooks/useSagar";
import useScenario from "../hooks/useScenario";
import { useConnectivity } from "../hooks/useConnectivity";
import { useOfflineSync, describeSnapshotAge } from "../hooks/useOfflineSync";
import { useMarineModelGrid } from "../hooks/useMarineModelGrid";

import {
  fetchOcean,
  fetchRisk,
  fetchSstPrediction,
  fetchWeather,
  type SstPredictionResult,
} from "../services/api/sagarApiClient";
import type {
  AgentEvidence,
  AgentResponse,
  OceanAgentData,
  RiskAgentData,
  WeatherAgentData,
} from "../services/agents/agentTypes";

import { useAppStore } from "../store/appStore";
import { ROUTES } from "../constants/routes";
import {
  SOURCES,
  categoryIcon,
  categoryLabel,
  statusLabel,
  statusTone,
} from "./Sources";

import "./MarineIntelligenceLab.css";

/**
 * Marine Intelligence Lab — a research console over Sagar's real
 * marine-reasoning services. Every module calls the same hooks and API
 * client the rest of the app uses (useSagar, useScenario, useOfflineSync,
 * fetchWeather/fetchOcean/fetchRisk/fetchSstPrediction) - nothing here
 * is a static mock, and no module claims a capability that isn't
 * actually wired up.
 */

type ModuleId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type ModuleDef = {
  id: ModuleId;
  title: string;
  blurb: string;
  icon: typeof Bot;
};

const MODULES: ModuleDef[] = [
  { id: 1, title: "Agentic Reasoning", blurb: "Ask Sagar a real question and see how it answers.", icon: Bot },
  { id: 2, title: "Cross-Source Fusion", blurb: "Weather + ocean + risk combined into one decision.", icon: Layers3 },
  { id: 3, title: "Data Provenance", blurb: "Where each value came from, and how fresh it is.", icon: FileSearch },
  { id: 4, title: "MOSDAC / Earth Observation", blurb: "Real connection status of India's satellite ocean data.", icon: Satellite },
  { id: 5, title: "SST Intelligence", blurb: "Sagar's real sea-surface-temperature research model.", icon: Thermometer },
  { id: 6, title: "Offline Innovation", blurb: "Sagar's real offline sync and local decision engine.", icon: CloudOff },
  { id: 7, title: "Validation / Experiments", blurb: "Real status of every capability above, in one place.", icon: ClipboardCheck },
];

function riskTone(level?: string): "success" | "warning" | "danger" | "neutral" {
  switch (level?.toLowerCase()) {
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

function evidenceToItem(item: AgentEvidence): EvidenceItem {
  return {
    id: item.id,
    source: item.source ?? item.type,
    title: item.title,
    detail: item.summary,
    timestamp: item.timestamp,
  };
}

// ---------------------------------------------------------------------------
// Shared agent signals (weather / ocean / risk) - one real fetch, reused by
// the Fusion and Provenance modules so they never disagree or re-fetch.
// ---------------------------------------------------------------------------

type AgentSignals = {
  weather: AgentResponse<WeatherAgentData> | null;
  ocean: AgentResponse<OceanAgentData> | null;
  risk: AgentResponse<RiskAgentData> | null;
  loading: boolean;
  error: string | null;
};

function useAgentSignals(areaId: string | null): AgentSignals & { refresh: () => void } {
  const [state, setState] = useState<AgentSignals>({
    weather: null,
    ocean: null,
    risk: null,
    loading: true,
    error: null,
  });

  const load = useMemo(
    () => async () => {
      setState((current) => ({ ...current, loading: true, error: null }));

      const options = areaId ? { areaId } : {};

      const [weather, ocean, risk] = await Promise.allSettled([
        fetchWeather(options),
        fetchOcean(options),
        fetchRisk(options),
      ]);

      setState({
        weather: weather.status === "fulfilled" ? weather.value : null,
        ocean: ocean.status === "fulfilled" ? ocean.value : null,
        risk: risk.status === "fulfilled" ? risk.value : null,
        loading: false,
        error:
          weather.status === "rejected" &&
          ocean.status === "rejected" &&
          risk.status === "rejected"
            ? "Sagar's backend is unreachable right now."
            : null,
      });
    },
    [areaId]
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId]);

  return { ...state, refresh: load };
}

// ---------------------------------------------------------------------------
// Small shared presentational bits
// ---------------------------------------------------------------------------

function ModuleShell({
  icon: Icon,
  title,
  blurb,
  statusBadge,
  children,
}: {
  icon: typeof Bot;
  title: string;
  blurb: string;
  statusBadge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mil-module">
      <header className="mil-module-header">
        <div className="mil-module-heading">
          <div className="mil-module-icon">
            <Icon size={18} />
          </div>
          <div>
            <h2>{title}</h2>
            <p>{blurb}</p>
          </div>
        </div>
        {statusBadge}
      </header>

      <div className="mil-module-body">{children}</div>
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="mil-section-label">{children}</span>;
}

// ---------------------------------------------------------------------------
// Module 1 — Agentic Reasoning
// ---------------------------------------------------------------------------

const AGENTIC_PRESETS = [
  "Is it safe to fish near Thoothukudi Coast right now?",
  "What data are you using for this decision?",
  "What happens if wind speed increases by 20%?",
  "Which fishing zones do you recommend today?",
];

function ModuleAgentic({
  sagar,
}: {
  sagar: ReturnType<typeof useSagar>;
}) {
  const [value, setValue] = useState("");

  const handleSend = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sagar.loading) return;
    void sagar.sendMessage(trimmed);
    setValue("");
  };

  const recent = sagar.messages.slice(-6);

  return (
    <ModuleShell
      icon={Bot}
      title="Agentic Reasoning"
      blurb="Sagar answers through one real pipeline: a deterministic intent gate, area resolution, the weather/ocean/risk agents, evidence assembly, and — only when no deterministic answer already applies — a local LLM narration pass."
      statusBadge={<Badge tone="neutral">Live pipeline</Badge>}
    >
      <div className="mil-note mil-note-neutral">
        <AlertTriangle size={14} />
        <p>
          Per-agent run/skip tracing is not exposed by the current API, so this module shows the
          real evidence, risk and confidence a question actually produces instead of a fabricated
          step-by-step trace.
        </p>
      </div>

      <div className="mil-preset-row">
        {AGENTIC_PRESETS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="mil-preset-chip"
            disabled={sagar.loading}
            onClick={() => handleSend(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="mil-thread">
        {recent.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="Ask Sagar a real question"
            description="Pick a preset above or type your own — this calls the same /api/chat pipeline as the Chat page."
          />
        ) : (
          recent.map((message) => (
            <ChatMessage
              key={message.id}
              role={message.role}
              timestamp={message.timestamp}
              structured={message.structured}
            >
              {message.text}
            </ChatMessage>
          ))
        )}

        {sagar.loading && <LoadingState label="Sagar is reasoning..." />}
        {sagar.error && <ErrorState message={sagar.error} />}
      </div>

      <form
        className="mil-ask-row"
        onSubmit={(event) => {
          event.preventDefault();
          handleSend(value);
        }}
      >
        <label htmlFor="mil-agentic-input" className="mil-visually-hidden">
          Ask Sagar a research question
        </label>
        <input
          id="mil-agentic-input"
          type="text"
          value={value}
          disabled={sagar.loading}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Ask Sagar anything a fisher would ask…"
        />
        <button type="submit" className="mil-ask-send" disabled={sagar.loading} aria-label="Send">
          <Send size={16} />
        </button>
      </form>
    </ModuleShell>
  );
}

// ---------------------------------------------------------------------------
// Module 2 — Cross-Source Fusion
// ---------------------------------------------------------------------------

function ModuleFusion({
  signals,
  scenario,
  areaLabel,
}: {
  signals: AgentSignals & { refresh: () => void };
  scenario: ReturnType<typeof useScenario>;
  areaLabel: string;
}) {
  const [waveIncrease, setWaveIncrease] = useState(20);

  const weather = signals.weather?.data;
  const ocean = signals.ocean?.data;
  const risk = signals.risk?.data;

  const weatherScenario = scenario.scenarios.find((s) => s.type === "weather_change");

  const baselineScore = risk?.riskScore;
  const baselineLevel = risk?.riskLevel;

  const handleRun = async () => {
    if (!weatherScenario) return;
    await scenario.run(weatherScenario, {
      waveIncreasePercent: waveIncrease,
      windSpeedIncreasePercent: 0,
      lightningRisk: "low",
      productivityDecreasePercent: 0,
      departureTime: "06:00",
      durationHours: 6,
      vesselType: "small",
    });
  };

  const result = scenario.result;
  const delta =
    result && typeof baselineScore === "number" ? result.riskScore - baselineScore : null;

  return (
    <ModuleShell
      icon={Layers3}
      title="Cross-Source Fusion"
      blurb={`Sagar's weather, ocean and risk agents combined into one decision for ${areaLabel}.`}
      statusBadge={
        signals.loading ? (
          <Badge tone="neutral">Loading…</Badge>
        ) : signals.error ? (
          <Badge tone="danger">Unreachable</Badge>
        ) : (
          <Badge tone="success">Live agents</Badge>
        )
      }
    >
      {signals.error && !signals.loading && (
        <ErrorState message={signals.error} retry={signals.refresh} />
      )}

      {signals.loading && !signals.weather && !signals.ocean && !signals.risk ? (
        <LoadingState label="Calling weather, ocean and risk agents…" />
      ) : (
        <>
          <SectionLabel>Real current signals</SectionLabel>
          <div className="mil-metric-grid">
            <MarineMetric
              label="Wind speed"
              value={weather?.windSpeedKnots ?? "—"}
              unit={weather?.windSpeedKnots !== undefined ? "kn" : undefined}
              status={weather?.hazards.strongWind ? "warning" : "normal"}
            />
            <MarineMetric
              label="Wave height"
              value={weather?.waveHeightM ?? "—"}
              unit={weather?.waveHeightM !== undefined ? "m" : undefined}
              status={weather?.hazards.roughSea ? "warning" : "normal"}
            />
            <MarineMetric
              label="Visibility"
              value={weather?.visibilityKm ?? "—"}
              unit={weather?.visibilityKm !== undefined ? "km" : undefined}
            />
            <MarineMetric
              label="Sea surface temp."
              value={ocean?.seaSurfaceTemperatureC ?? "—"}
              unit={ocean?.seaSurfaceTemperatureC !== undefined ? "°C" : undefined}
            />
            <MarineMetric
              label="Chlorophyll"
              value={ocean?.chlorophyllMgM3 ?? "—"}
              unit={ocean?.chlorophyllMgM3 !== undefined ? "mg/m³" : undefined}
              detail={ocean?.productivitySignal}
            />
            <MarineMetric
              label="Productivity index"
              value={ocean?.productivityIndex ?? "—"}
              trend={
                ocean?.trend === "increasing"
                  ? "up"
                  : ocean?.trend === "decreasing"
                    ? "down"
                    : ocean?.trend
                      ? "stable"
                      : undefined
              }
            />
          </div>

          {typeof baselineScore === "number" && baselineLevel && (
            <>
              <SectionLabel>Fused decision (real risk agent)</SectionLabel>
              <RiskIndicator
                level={baselineLevel}
                score={baselineScore}
                title="Combined risk"
                description={risk?.recommendation}
              />
            </>
          )}
        </>
      )}

      <div className="mil-divider" />

      <SectionLabel>Experiment: change one input</SectionLabel>
      {!weatherScenario ? (
        <p className="mil-muted-text">
          The scenario engine has no weather-change scenario configured right now.
        </p>
      ) : (
        <div className="mil-experiment">
          <p className="mil-muted-text">
            Everything else is held at a neutral baseline. Move wave height and run the same
            deterministic scenario engine the What-If Analysis page uses.
          </p>

          <label className="mil-slider-field">
            <span>
              Wave height increase <strong>{waveIncrease}%</strong>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={waveIncrease}
              onChange={(event) => setWaveIncrease(Number(event.target.value))}
            />
          </label>

          <Button
            variant="primary"
            size="sm"
            onClick={handleRun}
            disabled={scenario.loading}
          >
            <Sparkles size={14} />
            {scenario.loading ? "Running scenario…" : "Run scenario"}
          </Button>

          {scenario.error && <ErrorState message={scenario.error} />}

          {result && (
            <div className="mil-compare">
              <div className="mil-compare-col">
                <span>Baseline</span>
                <strong>{baselineScore ?? "—"}</strong>
                {baselineLevel && (
                  <Badge tone={riskTone(baselineLevel)} size="sm">
                    {baselineLevel.toUpperCase()}
                  </Badge>
                )}
              </div>
              <ArrowRight size={18} className="mil-compare-arrow" />
              <div className="mil-compare-col">
                <span>With +{waveIncrease}% waves</span>
                <strong>{result.riskScore}</strong>
                <Badge tone={riskTone(result.riskLevel)} size="sm">
                  {result.riskLevel.toUpperCase()}
                </Badge>
              </div>
              <div className="mil-compare-delta">
                <span>Shift</span>
                <strong>
                  {delta === null
                    ? "—"
                    : delta === 0
                      ? "No change"
                      : `${delta > 0 ? "+" : ""}${delta} pts`}
                </strong>
              </div>
            </div>
          )}

          {result && (
            <p className="mil-recommendation">
              <strong>Recommendation:</strong> {result.recommendation}
            </p>
          )}
        </div>
      )}
    </ModuleShell>
  );
}

// ---------------------------------------------------------------------------
// Module 3 — Data Provenance
// ---------------------------------------------------------------------------

function ModuleProvenance({
  signals,
  sagar,
}: {
  signals: AgentSignals & { refresh: () => void };
  sagar: ReturnType<typeof useSagar>;
}) {
  const allEvidence: AgentEvidence[] = useMemo(() => {
    const items = [
      ...(signals.weather?.evidence ?? []),
      ...(signals.ocean?.evidence ?? []),
      ...(signals.risk?.evidence ?? []),
    ];

    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [signals.weather, signals.ocean, signals.risk]);

  const lastAssistant = [...sagar.messages].reverse().find((m) => m.role === "assistant");
  const verified = lastAssistant?.structured?.verifiedSource;

  return (
    <ModuleShell
      icon={FileSearch}
      title="Data Provenance"
      blurb="Every value below comes straight from the agents' own evidence records — source, title and timestamp, never re-derived."
      statusBadge={<Badge tone="neutral">{allEvidence.length} records</Badge>}
    >
      {signals.loading && allEvidence.length === 0 ? (
        <LoadingState label="Collecting evidence…" />
      ) : (
        <EvidencePanel
          title="Evidence from the weather, ocean and risk agents"
          items={allEvidence.map(evidenceToItem)}
        />
      )}

      <div className="mil-divider" />

      <SectionLabel>Confidence &amp; freshness</SectionLabel>
      {verified ? (
        <div className="mil-provenance-card">
          <div className="mil-provenance-row">
            <span>Most recent verified reading</span>
            <strong>{verified.name}</strong>
          </div>
          <div className="mil-provenance-row">
            <span>Age</span>
            <strong>{verified.age}</strong>
          </div>
          <div className="mil-provenance-row">
            <span>Freshness</span>
            <Badge tone={freshnessToneOf(verified.freshness)}>{describeModelFreshness(verified.freshness)}</Badge>
          </div>
          {typeof verified.distanceFromAreaKm === "number" && (
            <div className="mil-provenance-row">
              <span>Distance from area</span>
              <strong>~{verified.distanceFromAreaKm} km</strong>
            </div>
          )}
        </div>
      ) : (
        <p className="mil-muted-text">
          Confidence and freshness classification are computed by Sagar's chat pipeline. Ask a
          question in <strong>Agentic Reasoning</strong> to see a real reading classified here.
        </p>
      )}
    </ModuleShell>
  );
}

function freshnessToneOf(freshness: string): "success" | "warning" | "danger" | "neutral" {
  switch (freshness) {
    case "LIVE":
    case "RECENT":
      return "success";
    case "AGING":
      return "warning";
    case "STALE":
    case "OFFLINE":
    case "UNAVAILABLE":
      return "danger";
    default:
      return "neutral";
  }
}

/**
 * Presentational-only relabeling, mirroring MarineMap.tsx's
 * describeModelFreshness (kept in sync deliberately) - the bare word
 * "LIVE" on a verified reading that's actually Open-Meteo forecast
 * output would read as a live-sensor claim, which the app's data-truth
 * rule forbids. freshnessEngine.ts's raw FreshnessStatus values are
 * unchanged elsewhere (e.g. this same value still drives the tone via
 * freshnessToneOf above); only the displayed word changes.
 */
function describeModelFreshness(freshness: string): string {
  switch (freshness) {
    case "LIVE":
      return "Just updated";
    case "RECENT":
      return "Recently updated";
    case "AGING":
      return "Aging";
    case "STALE":
      return "Stale";
    case "OFFLINE":
      return "Offline";
    case "UNAVAILABLE":
      return "Unavailable";
    default:
      return freshness;
  }
}

// ---------------------------------------------------------------------------
// Module 4 — MOSDAC / Earth Observation
// ---------------------------------------------------------------------------

function ModuleEarthObservation({ activeModule }: { activeModule: ModuleId }) {
  const grid = useMarineModelGrid({ enabled: activeModule === 4 });
  const navigate = useNavigate();

  const satelliteSources = SOURCES.filter(
    (source) => source.category === "satellite" || source.category === "marine"
  );

  return (
    <ModuleShell
      icon={Satellite}
      title="MOSDAC / Earth Observation"
      blurb="Real connection status of India's satellite and ocean data providers, from Sagar's own Data Sources catalog."
      statusBadge={<Badge tone="neutral">{satelliteSources.length} providers</Badge>}
    >
      <div className="mil-source-grid">
        {satelliteSources.map((source) => {
          const Icon = categoryIcon(source.category);
          return (
            <div key={source.id} className="mil-source-card">
              <div className="mil-source-top">
                <div className="mil-source-icon">
                  <Icon size={16} />
                </div>
                <Badge tone={statusTone(source.status)} size="sm">
                  {statusLabel(source.status).toUpperCase()}
                </Badge>
              </div>
              <span className="mil-source-category">{categoryLabel(source.category)}</span>
              <h3>{source.name}</h3>
              <p>{source.description}</p>
            </div>
          );
        })}
      </div>

      <div className="mil-divider" />

      <SectionLabel>Real geospatial grid probe (Open-Meteo)</SectionLabel>
      <p className="mil-muted-text">
        A real forecast/model grid — never labelled live — used for the map's optional layers.
      </p>

      {grid.loading && <LoadingState label="Fetching the model grid…" />}
      {grid.error && !grid.loading && <ErrorState message={grid.error} retry={grid.refresh} />}

      {!grid.loading && !grid.error && grid.points.length > 0 && (
        <div className="mil-grid-summary">
          <div className="mil-provenance-row">
            <span>Points returned</span>
            <strong>{grid.points.length}</strong>
          </div>
          <div className="mil-provenance-row">
            <span>Fetched</span>
            <strong>{grid.lastFetchedAt ?? "—"}</strong>
          </div>
          <div className="mil-provenance-row">
            <span>Provider</span>
            <strong>Open-Meteo</strong>
          </div>
        </div>
      )}

      <Button variant="secondary" size="sm" onClick={() => navigate(ROUTES.MAP)}>
        Open Marine Map
        <ArrowRight size={14} />
      </Button>
    </ModuleShell>
  );
}

// ---------------------------------------------------------------------------
// Module 5 — SST Intelligence
// ---------------------------------------------------------------------------

const SST_LOCATIONS = [
  { name: "Thoothukudi", latitude: 8.76, longitude: 78.13 },
  { name: "Central Gulf of Mannar", latitude: 8.85, longitude: 78.6 },
  { name: "Northern Gulf of Mannar", latitude: 9.1, longitude: 78.8 },
  { name: "Southern Gulf of Mannar", latitude: 8.4, longitude: 78.2 },
];

// Mirrors SstResearchLab.tsx's own formatTimestamp (kept in sync
// deliberately) - Open-Meteo's timestamp is UTC, so this must not be
// left as a raw unformatted string for the user.
function formatSstTimestamp(iso: string): string {
  const parsed = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ModuleSst({
  result,
  loading,
  error,
  onRun,
}: {
  result: SstPredictionResult | null;
  loading: boolean;
  error: string | null;
  onRun: (latitude: number, longitude: number) => void;
}) {
  const navigate = useNavigate();
  const [location, setLocation] = useState(SST_LOCATIONS[0]!);

  return (
    <ModuleShell
      icon={Thermometer}
      title="SST Intelligence"
      blurb="Sagar's real, trained sea-surface-temperature model — the same one behind the full SST Research Lab."
      statusBadge={
        result?.status === "success" ? (
          <Badge tone={result.modelInfo.validated ? "success" : "warning"}>
            {result.modelInfo.validationLabel}
          </Badge>
        ) : undefined
      }
    >
      <div className="mil-preset-row">
        {SST_LOCATIONS.map((loc) => (
          <button
            key={loc.name}
            type="button"
            className={`mil-preset-chip${location.name === loc.name ? " mil-preset-chip-active" : ""}`}
            onClick={() => setLocation(loc)}
          >
            {loc.name}
          </button>
        ))}
      </div>

      <Button
        variant="primary"
        size="sm"
        disabled={loading}
        onClick={() => onRun(location.latitude, location.longitude)}
      >
        <Thermometer size={14} />
        {loading ? "Running model…" : "Check current data & predict"}
      </Button>

      {loading && <LoadingState label="Fetching real marine data and running the SST model…" />}

      {error && !loading && <ErrorState message={error} retry={() => onRun(location.latitude, location.longitude)} />}

      {result?.status === "insufficient_data" && (
        <ErrorState
          title="Not enough historical data"
          message={result.data.reason}
        />
      )}

      {result?.status === "success" && (
        <div className="mil-metric-grid">
          <MarineMetric
            label="Current SST"
            value={result.currentSst}
            unit="°C"
            detail={`Model reading ${formatSstTimestamp(result.sstObservedAt)}`}
          />
          <MarineMetric
            label={`Predicted (${result.predictionHorizon})`}
            value={result.predictedSst}
            unit="°C"
            detail={result.modelInfo.validationReason}
          />
          <MarineMetric
            label="Test MAE"
            value={result.modelInfo.metrics.test.mae.toFixed(3)}
            unit="°C"
            detail={`Baseline ${result.modelInfo.baseline.test.mae.toFixed(3)} °C`}
          />
          <MarineMetric
            label="Test R²"
            value={result.modelInfo.metrics.test.r2.toFixed(3)}
          />
        </div>
      )}

      <Button variant="secondary" size="sm" onClick={() => navigate("/research/sst")}>
        Open full SST Research Lab
        <ArrowRight size={14} />
      </Button>
    </ModuleShell>
  );
}

// ---------------------------------------------------------------------------
// Module 6 — Offline Innovation
// ---------------------------------------------------------------------------

function ModuleOffline({
  connectivity,
}: {
  connectivity: ReturnType<typeof useConnectivity>;
}) {
  const { snapshot, syncStatus, syncError, sync } = useOfflineSync();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const handleSync = async () => {
    const outcome = await sync();
    setSyncMessage(outcome.message);
  };

  const statusIcon =
    connectivity.status === "online" ? Wifi : connectivity.status === "syncing" ? RefreshCw : WifiOff;
  const StatusIcon = statusIcon;

  return (
    <ModuleShell
      icon={CloudOff}
      title="Offline Innovation"
      blurb="Sagar's real offline snapshot and local decision engine — the same mechanism behind Chat's 'Sync for offline' control."
      statusBadge={
        <Badge
          tone={
            connectivity.status === "online"
              ? "success"
              : connectivity.status === "offline"
                ? "danger"
                : "warning"
          }
        >
          <StatusIcon size={12} />
          {connectivity.status.toUpperCase()}
        </Badge>
      }
    >
      <div className="mil-metric-grid">
        <MarineMetric label="Device network" value={connectivity.browserOnline ? "Online" : "Offline"} />
        <MarineMetric
          label="Last backend request"
          value={
            connectivity.backendReachable === undefined
              ? "Not tried yet"
              : connectivity.backendReachable
                ? "Succeeded"
                : "Failed"
          }
          status={connectivity.backendReachable === false ? "warning" : "normal"}
        />
        <MarineMetric
          label="Local snapshot"
          value={snapshot ? describeSnapshotAge(snapshot.createdAt) : "None yet"}
        />
        <MarineMetric label="Snapshot version" value={snapshot?.snapshotVersion ?? "—"} />
      </div>

      {snapshot && (
        <div className="mil-provenance-card">
          <div className="mil-provenance-row">
            <span>Marine areas synced</span>
            <strong>
              {snapshot.sources.marine.recordCount} ({snapshot.sources.marine.status})
            </strong>
          </div>
          <div className="mil-provenance-row">
            <span>Alerts synced</span>
            <strong>
              {snapshot.sources.alerts.recordCount} ({snapshot.sources.alerts.status})
            </strong>
          </div>
        </div>
      )}

      <Button variant="primary" size="sm" onClick={handleSync} disabled={syncStatus === "syncing"}>
        <RefreshCw size={14} />
        {syncStatus === "syncing" ? "Syncing…" : "Sync for offline"}
      </Button>

      {syncMessage && (
        <p className="mil-muted-text">
          <CheckCircle2 size={13} /> {syncMessage}
        </p>
      )}
      {syncError && <ErrorState message={syncError} />}

      <div className="mil-note mil-note-neutral">
        <AlertTriangle size={14} />
        <p>
          Sagar does not measure or claim a specific compression ratio, model size or latency for
          offline mode — only the real sync/version/local-engine mechanism shown above exists
          today.
        </p>
      </div>
    </ModuleShell>
  );
}

// ---------------------------------------------------------------------------
// Module 7 — Validation / Experiments
// ---------------------------------------------------------------------------

type CapabilityRow = {
  name: string;
  detail: string;
  tone: "success" | "warning" | "danger" | "neutral";
  label: string;
};

function ModuleValidation({
  signals,
  scenario,
  sstResult,
  connectivity,
  offlineSnapshotAge,
}: {
  signals: AgentSignals;
  scenario: ReturnType<typeof useScenario>;
  sstResult: SstPredictionResult | null;
  connectivity: ReturnType<typeof useConnectivity>;
  offlineSnapshotAge: string | null;
}) {
  const incois = SOURCES.find((s) => s.id === "incois");
  const isro = SOURCES.find((s) => s.id === "isro");

  const rows: CapabilityRow[] = [
    {
      name: "Chat pipeline (/api/chat)",
      detail:
        connectivity.backendReachable === false
          ? "Last request failed — falling back to the local offline engine."
          : "Reachable and answering with real evidence and risk data.",
      tone: connectivity.backendReachable === false ? "danger" : "success",
      label: connectivity.backendReachable === false ? "Unreachable" : "Reachable",
    },
    {
      name: "Weather / Ocean / Risk agents",
      detail: signals.error
        ? "Backend unreachable for this area."
        : `${[signals.weather, signals.ocean, signals.risk].filter(Boolean).length} of 3 agents responded.`,
      tone: signals.error ? "danger" : "success",
      label: signals.error ? "Unreachable" : "Reachable",
    },
    {
      name: "What-if scenario engine",
      detail: scenario.error
        ? scenario.error
        : `${scenario.scenarios.length} scenario definitions loaded.`,
      tone: scenario.error ? "danger" : "success",
      label: scenario.error ? "Unreachable" : "Reachable",
    },
    {
      name: "SST research model",
      detail:
        sstResult === null
          ? "Not run yet in this session — open SST Intelligence to run it."
          : sstResult.status === "insufficient_data"
            ? sstResult.data.reason
            : sstResult.modelInfo.validationReason,
      tone:
        sstResult === null
          ? "neutral"
          : sstResult.status === "success" && sstResult.modelInfo.validated
            ? "success"
            : "warning",
      label:
        sstResult === null
          ? "Not run"
          : sstResult.status === "insufficient_data"
            ? "Insufficient data"
            : sstResult.modelInfo.validationLabel,
    },
    {
      name: "INCOIS (ocean reference)",
      detail: incois?.description ?? "Not configured.",
      tone: statusTone(incois?.status ?? "planned"),
      label: statusLabel(incois?.status ?? "planned"),
    },
    {
      name: "ISRO / MOSDAC (satellite)",
      detail: isro?.description ?? "Not configured.",
      tone: statusTone(isro?.status ?? "planned"),
      label: statusLabel(isro?.status ?? "planned"),
    },
    {
      name: "Offline sync",
      detail: offlineSnapshotAge
        ? `Local snapshot last synced ${offlineSnapshotAge}.`
        : "No snapshot has been synced yet.",
      tone: offlineSnapshotAge ? "success" : "neutral",
      label: offlineSnapshotAge ? "Synced" : "Not synced",
    },
  ];

  return (
    <ModuleShell
      icon={ClipboardCheck}
      title="Validation / Experiments"
      blurb="One real status check per capability — evidenced from an actual call, never a progress bar."
      statusBadge={<Badge tone="neutral">{rows.length} checks</Badge>}
    >
      <div className="mil-check-table">
        <div className="mil-check-head">
          <span>Capability</span>
          <span>What it actually shows</span>
          <span>Status</span>
        </div>
        {rows.map((row) => (
          <div key={row.name} className="mil-check-row">
            <span className="mil-check-name">{row.name}</span>
            <span className="mil-check-detail">{row.detail}</span>
            <span>
              <Badge tone={row.tone} size="sm">
                {row.tone === "success" ? (
                  <CheckCircle2 size={11} />
                ) : row.tone === "danger" ? (
                  <XCircle size={11} />
                ) : (
                  <AlertTriangle size={11} />
                )}
                {row.label}
              </Badge>
            </span>
          </div>
        ))}
      </div>

      <div className="mil-divider" />

      <SectionLabel>Ask Sagar about this system</SectionLabel>
      <div className="mil-preset-row">
        <AskSagarButton prompt="Why is this area risky?" label="Why is this risky?" />
        <AskSagarButton prompt="What data are you using for this decision?" label="What data?" />
        <AskSagarButton
          prompt="What happens if wind speed increases by 20%?"
          label="What if wind increases?"
        />
      </div>
    </ModuleShell>
  );
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

export default function MarineIntelligenceLab() {
  const [activeModule, setActiveModule] = useState<ModuleId>(1);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const [sstResult, setSstResult] = useState<SstPredictionResult | null>(null);
  const [sstLoading, setSstLoading] = useState(false);
  const [sstError, setSstError] = useState<string | null>(null);
  // Guards against a stale response overwriting a newer one if the SST
  // module is re-run for a different location before the prior call resolves.
  const sstRequestIdRef = useRef(0);

  const selectedAreaId = useAppStore((state) => state.selectedAreaId);
  const locationLabel = useAppStore((state) => state.locationLabel);

  const sagar = useSagar();
  const scenario = useScenario();
  const connectivity = useConnectivity();
  const signals = useAgentSignals(selectedAreaId);

  const { snapshot } = useOfflineSync();

  const runSst = async (latitude: number, longitude: number) => {
    const requestId = ++sstRequestIdRef.current;
    setSstLoading(true);
    setSstError(null);
    try {
      const result = await fetchSstPrediction(latitude, longitude);
      if (sstRequestIdRef.current !== requestId) return;
      setSstResult(result);
    } catch {
      if (sstRequestIdRef.current !== requestId) return;
      setSstResult(null);
      setSstError("Sagar's backend is unreachable, so the SST model could not run.");
    } finally {
      if (sstRequestIdRef.current === requestId) {
        setSstLoading(false);
      }
    }
  };

  const active = MODULES.find((m) => m.id === activeModule)!;
  const areaLabel = locationLabel ?? "your current area";

  const connectedSources = SOURCES.filter(
    (s) => s.status === "integrated" || s.status === "available" || s.status === "partial"
  ).length;

  return (
    <AppShell>
      <PageContainer className="mil-page">
        <header className="mil-header">
          <div>
            <div className="mil-eyebrow">
              <Sparkles size={14} />
              <span>Research Console</span>
            </div>
            <h1>Marine Intelligence Lab</h1>
            <p>
              A real, working look inside Sagar's marine reasoning — the same agents, scenario
              engine, SST model and offline sync used across the app, gathered in one place.
            </p>
          </div>

          <Button variant="secondary" size="sm" onClick={() => signals.refresh()}>
            <RefreshCw size={14} className={signals.loading ? "mil-spin" : undefined} />
            Refresh data
          </Button>
        </header>

        <section className="mil-summary-strip">
          <div className="mil-summary-card">
            <div className="mil-summary-icon mil-bg-slate">
              <Database size={17} />
            </div>
            <div>
              <span>Cataloged sources</span>
              <strong>{SOURCES.length}</strong>
            </div>
          </div>
          <div className="mil-summary-card">
            <div className="mil-summary-icon mil-bg-green">
              <CheckCircle2 size={17} />
            </div>
            <div>
              <span>Connected / available</span>
              <strong>{connectedSources}</strong>
            </div>
          </div>
          <div className="mil-summary-card">
            <div className="mil-summary-icon mil-bg-blue">
              {connectivity.status === "online" ? <Wifi size={17} /> : <WifiOff size={17} />}
            </div>
            <div>
              <span>Connectivity</span>
              <strong>{connectivity.status}</strong>
            </div>
          </div>
          <div className="mil-summary-card">
            <div className="mil-summary-icon mil-bg-teal">
              <CloudOff size={17} />
            </div>
            <div>
              <span>Offline snapshot</span>
              <strong>{snapshot ? describeSnapshotAge(snapshot.createdAt) : "None"}</strong>
            </div>
          </div>
        </section>

        {/* Mobile module selector */}
        <button
          type="button"
          className="mil-mobile-selector"
          onClick={() => setSwitcherOpen((current) => !current)}
        >
          <div className="mil-mobile-selector-icon">
            <active.icon size={16} />
          </div>
          <div>
            <span>Module {active.id} of 7</span>
            <strong>{active.title}</strong>
          </div>
          <ChevronDown size={16} className={`mil-chevron ${switcherOpen ? "open" : ""}`} />
        </button>

        {switcherOpen && (
          <div className="mil-mobile-list">
            {MODULES.map((mod) => (
              <button
                key={mod.id}
                type="button"
                className={`mil-mobile-list-item ${mod.id === activeModule ? "active" : ""}`}
                onClick={() => {
                  setActiveModule(mod.id);
                  setSwitcherOpen(false);
                }}
              >
                <mod.icon size={16} />
                <div>
                  <strong>{mod.title}</strong>
                  <span>{mod.blurb}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Desktop module grid */}
        <nav className="mil-module-grid" aria-label="Research modules">
          {MODULES.map((mod) => (
            <button
              key={mod.id}
              type="button"
              className={`mil-module-card ${mod.id === activeModule ? "active" : ""}`}
              onClick={() => setActiveModule(mod.id)}
            >
              <div className="mil-module-card-icon">
                <mod.icon size={18} />
              </div>
              <div className="mil-module-card-content">
                <strong>{mod.title}</strong>
                <p>{mod.blurb}</p>
              </div>
              {mod.id === activeModule && (
                <CheckCircle2 size={16} className="mil-module-card-check" />
              )}
            </button>
          ))}
        </nav>

        <main className="mil-workspace">
          {activeModule === 1 && <ModuleAgentic sagar={sagar} />}
          {activeModule === 2 && (
            <ModuleFusion signals={signals} scenario={scenario} areaLabel={areaLabel} />
          )}
          {activeModule === 3 && <ModuleProvenance signals={signals} sagar={sagar} />}
          {activeModule === 4 && <ModuleEarthObservation activeModule={activeModule} />}
          {activeModule === 5 && (
            <ModuleSst result={sstResult} loading={sstLoading} error={sstError} onRun={runSst} />
          )}
          {activeModule === 6 && <ModuleOffline connectivity={connectivity} />}
          {activeModule === 7 && (
            <ModuleValidation
              signals={signals}
              scenario={scenario}
              sstResult={sstResult}
              connectivity={connectivity}
              offlineSnapshotAge={snapshot ? describeSnapshotAge(snapshot.createdAt) : null}
            />
          )}
        </main>
      </PageContainer>
    </AppShell>
  );
}
