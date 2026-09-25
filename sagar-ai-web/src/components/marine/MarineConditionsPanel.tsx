import {
  AlertTriangle,
  Clock3,
  Eye,
  RefreshCw,
  Thermometer,
  Timer,
  Waves,
  Wind,
  WifiOff,
} from "lucide-react";

import { APP_CONFIG } from "../../constants/config";
import type { MarineDataOrigin } from "../../hooks/useMarineData";
import {
  CONFIGURED_SOURCE_LABEL,
  type useMarineConditions,
} from "../../hooks/useMarineConditions";
import type { MarineConditionsBasis } from "../../services/agents/agentTypes";
import type { MarineArea } from "../../types/marine";
import {
  describeAge,
  formatIST,
  type MarineReading,
} from "../../utils/freshness";
import FreshnessBadge from "./FreshnessBadge";
import MarineMetric from "./MarineMetric";

import "./MarineConditionsPanel.css";

type Conditions = ReturnType<typeof useMarineConditions>;

type MarineConditionsPanelProps = {
  area: MarineArea | null;
  conditions: Conditions;
  offline?: boolean;
  origin?: MarineDataOrigin | null;
  title?: string;
  /** What the area's risk score was calculated from (backend basis);
   * null/undefined when no risk result is available. */
  riskBasis?: MarineConditionsBasis | null;
};

const RISK_BASIS_NOTE: Record<MarineConditionsBasis, string> = {
  model:
    "Sagar's risk score uses the model wind & waves above; only visibility and hazard flags come from this profile.",
  "partial-model":
    "Sagar's risk score uses a mix of the model values above and this profile (see the risk label).",
  "configured-fallback":
    "Model data was unavailable to the risk service, so Sagar's risk score was calculated from this profile.",
  unavailable: "No marine values were available to the risk service.",
};

const REFRESH_MINUTES = Math.round(APP_CONFIG.marine.modelGrid.pollIntervalMs / 60000);

// Same presentation bands Area.tsx already uses for these values.
function waveTone(value?: number): "normal" | "warning" | "danger" {
  if (value === undefined) return "normal";
  if (value >= 1.8) return "danger";
  if (value >= 1.2) return "warning";
  return "normal";
}

function windTone(value?: number): "normal" | "warning" | "danger" {
  if (value === undefined) return "normal";
  if (value >= 22) return "danger";
  if (value >= 16) return "warning";
  return "normal";
}

function timeLabel(reading: MarineReading, now: number): string | null {
  const at = formatIST(reading.timestamp, now);
  if (!at) return null;
  const age = describeAge(reading.timestamp, now);
  return `Valid ${at}${age ? ` · ${age}` : ""}`;
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const ORIGIN_NOTE: Record<MarineDataOrigin, string> = {
  backend: "",
  "offline-snapshot": " · local offline copy (backend unreachable)",
  bundled: " · bundled copy (backend unreachable)",
};

export default function MarineConditionsPanel({
  area,
  conditions,
  offline = false,
  origin,
  title = "Marine conditions",
  riskBasis,
}: MarineConditionsPanelProps) {
  const { readings, status, validAt, now } = conditions;

  const metric = (
    key: keyof NonNullable<typeof readings>,
    label: string,
    icon: typeof Waves,
    tone?: (value?: number) => "normal" | "warning" | "danger",
  ) => {
    const reading = readings?.[key];
    if (!reading || typeof reading.value !== "number") return null;

    return (
      <MarineMetric
        key={key}
        label={label}
        value={reading.value}
        unit={reading.unit}
        icon={icon}
        status={tone ? tone(reading.value) : "normal"}
        detail={reading.note}
        provenance={{
          source: reading.source,
          time: timeLabel(reading, now),
          state: reading.state,
        }}
      />
    );
  };

  const metrics = [
    metric("waveHeight", "Wave height", Waves, waveTone),
    metric("wavePeriod", "Wave period", Timer),
    metric("wind", "Wind", Wind, windTone),
    metric("swellHeight", "Swell", Waves),
    metric("seaSurfaceTemperature", "Sea surface temp.", Thermometer),
  ].filter(Boolean);

  const validAtLabel = formatIST(validAt, now);
  const validAge = describeAge(validAt, now);

  const configuredRecorded = area?.updatedAt
    ? new Date(area.updatedAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      })
    : null;

  // No model values (unavailable / no grid coverage): show the area's
  // configured profile in the same cards so the panel is never empty -
  // each card keeps its configured source and FALLBACK badge.
  const configuredProvenance = {
    source: CONFIGURED_SOURCE_LABEL,
    time: configuredRecorded ? `Recorded ${configuredRecorded}` : null,
    state: "FALLBACK" as const,
  };
  const profile = area?.conditions;
  const fallbackMetrics =
    metrics.length === 0 && status !== "loading" && profile
      ? [
          typeof profile.waveHeightM === "number" && (
            <MarineMetric
              key="waveHeight"
              label="Wave height"
              value={profile.waveHeightM}
              unit="m"
              icon={Waves}
              status={waveTone(profile.waveHeightM)}
              detail={profile.waveDirection ? `From ${profile.waveDirection}` : undefined}
              provenance={configuredProvenance}
            />
          ),
          typeof profile.windSpeedKnots === "number" && (
            <MarineMetric
              key="wind"
              label="Wind"
              value={profile.windSpeedKnots}
              unit="kn"
              icon={Wind}
              status={windTone(profile.windSpeedKnots)}
              detail={profile.windDirection ? `From ${profile.windDirection}` : undefined}
              provenance={configuredProvenance}
            />
          ),
          typeof area?.marineIndicators?.seaSurfaceTemperatureC === "number" && (
            <MarineMetric
              key="seaSurfaceTemperature"
              label="Sea surface temp."
              value={area.marineIndicators.seaSurfaceTemperatureC}
              unit="°C"
              icon={Thermometer}
              provenance={configuredProvenance}
            />
          ),
          typeof profile.visibilityKm === "number" && (
            <MarineMetric
              key="visibility"
              label="Visibility"
              value={profile.visibilityKm}
              unit="km"
              icon={Eye}
              provenance={configuredProvenance}
            />
          ),
        ].filter(Boolean)
      : [];
  const profileNote = fallbackMetrics.length > 0 ? " Showing the configured area profile." : "";

  return (
    <section className="marine-conditions" aria-labelledby="marine-conditions-title">
      <header className="marine-conditions-header">
        <div>
          <span className="marine-conditions-eyebrow">{title}</span>
          <h2 id="marine-conditions-title">{area?.name ?? "No area selected"}</h2>
        </div>

        <button
          type="button"
          className="marine-conditions-refresh"
          onClick={conditions.refresh}
          disabled={conditions.loading || offline || !area}
          aria-label="Refresh marine model data"
          title="Refresh marine model data"
        >
          <RefreshCw
            size={14}
            className={conditions.loading ? "marine-conditions-spin" : undefined}
          />
        </button>
      </header>

      {status === "loading" && (
        <p className="marine-conditions-status" role="status">
          <Clock3 size={14} /> Fetching marine model data…
        </p>
      )}

      {status === "last-known" && (
        <p className="marine-conditions-status marine-conditions-status-warn" role="status">
          {offline ? <WifiOff size={14} /> : <AlertTriangle size={14} />}
          <span>
            {offline ? "Offline" : conditions.error ?? "Refresh failed"} — showing last known
            model data{validAtLabel ? ` (valid ${validAtLabel}${validAge ? `, ${validAge}` : ""})` : ""}.
          </span>
          {!offline && (
            <button type="button" onClick={conditions.refresh} disabled={conditions.loading}>
              Retry
            </button>
          )}
        </p>
      )}

      {status === "unavailable" && (
        <p className="marine-conditions-status marine-conditions-status-warn" role="status">
          {offline ? <WifiOff size={14} /> : <AlertTriangle size={14} />}
          <span>
            {offline
              ? `Offline — marine model data unavailable.${profileNote}`
              : `${conditions.error ?? "Marine model data unavailable."}${profileNote || " No model values to show."}`}
          </span>
          {!offline && (
            <button type="button" onClick={conditions.refresh} disabled={conditions.loading}>
              Retry
            </button>
          )}
        </p>
      )}

      {status === "no-coverage" && (
        <p className="marine-conditions-status" role="status">
          <AlertTriangle size={14} />
          <span>The marine model grid has no data point near this area.{profileNote}</span>
        </p>
      )}

      {metrics.length > 0 && <div className="marine-conditions-grid">{metrics}</div>}
      {fallbackMetrics.length > 0 && (
        <div className="marine-conditions-grid">{fallbackMetrics}</div>
      )}

      {area && (
        <div className="marine-conditions-configured">
          <div className="marine-conditions-configured-text">
            <strong>Configured area profile</strong>
            <span>
              {[
                area.conditions?.seaState ? `Sea state ${titleCase(area.conditions.seaState)}` : null,
                typeof area.conditions?.waveHeightM === "number"
                  ? `waves ${area.conditions.waveHeightM} m`
                  : null,
                typeof area.conditions?.windSpeedKnots === "number"
                  ? `wind ${area.conditions.windSpeedKnots} kn`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span className="marine-conditions-configured-meta">
              {CONFIGURED_SOURCE_LABEL}
              {configuredRecorded ? ` · recorded ${configuredRecorded}` : ""}
              {origin ? ORIGIN_NOTE[origin] : ""}.
              {riskBasis ? ` ${RISK_BASIS_NOTE[riskBasis]}` : ""}
            </span>
          </div>
          <FreshnessBadge state="FALLBACK" />
        </div>
      )}

      {metrics.length > 0 && (
        <p className="marine-conditions-footnote">
          Model output, not a local observation · refreshes every {REFRESH_MINUTES} min
          {conditions.attribution ? ` · ${conditions.attribution}` : ""}
        </p>
      )}
    </section>
  );
}
