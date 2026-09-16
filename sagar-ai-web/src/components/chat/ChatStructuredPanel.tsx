import {
  AlertTriangle,
  ArrowRight,
  MapPinned,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { formatDistance, formatDuration } from "../../utils/format";
import { getRiskDescription } from "../../utils/risk";

export type ChatMapAction = {
  label: string;
  onClick: () => void;
};

export type ChatZoneRecommendation = "PREFER" | "MONITOR" | "AVOID";

export type ChatZoneSummary = {
  name: string;
  recommendation: ChatZoneRecommendation;
  suitability?: string;
  reasons?: string[];
};

export type ChatWhatIfComparison = {
  question: string;
  before: { riskScore: number; riskLevel: string };
  after: { riskScore: number; riskLevel: string; operability?: string };
  impact: string;
  recommendation?: string;
};

export type ChatRouteSummary = {
  distanceKm?: number;
  durationHours?: number;
  riskLevel?: string;
  riskScore?: number;
  status?: string;
};

export type ChatStructuredData = {
  riskLevel?: string;
  riskScore?: number;
  keyFactors?: string[];
  evidenceTitles?: string[];
  whatIfSummary?: string;
  /** A small set of result-relevant actions (View on Map, View Route,
   * Simulate, ...) - never every possible action, just what applies to
   * this particular result. */
  actions?: ChatMapAction[];
  /** PFZ / fishing-zone recommendations - shown instead of a generic
   * area-wide risk score, which would read as contradicting the
   * per-zone suitability these already convey. */
  zones?: ChatZoneSummary[];
  /** Before/after comparison for a what-if scenario question. */
  whatIfComparison?: ChatWhatIfComparison;
  /** Compact route facts (distance/time/status) alongside a route answer. */
  route?: ChatRouteSummary;
};

type RiskTone = "low" | "moderate" | "high" | "critical" | "unknown";

const RISK_META: Record<
  RiskTone,
  { label: string; icon: typeof ShieldCheck }
> = {
  low: { label: "Low", icon: ShieldCheck },
  moderate: { label: "Moderate", icon: AlertTriangle },
  high: { label: "High", icon: ShieldAlert },
  critical: { label: "Critical", icon: ShieldAlert },
  unknown: { label: "Unknown", icon: AlertTriangle },
};

function normalizeRiskTone(level?: string): RiskTone {
  if (
    level === "low" ||
    level === "moderate" ||
    level === "high" ||
    level === "critical"
  ) {
    return level;
  }

  return "unknown";
}

function RiskBlock({
  level,
  score,
  title = "Risk assessment",
}: {
  level?: string;
  score?: number;
  title?: string;
}) {
  if (typeof score !== "number" || !level) {
    return null;
  }

  const tone = normalizeRiskTone(level);
  const meta = RISK_META[tone];
  const Icon = meta.icon;
  const description = tone === "unknown" ? undefined : getRiskDescription(tone);

  return (
    <div className={`chat-risk-block chat-risk-${tone}`}>
      <div className="chat-risk-top">
        <Icon size={13} strokeWidth={2.2} />
        <span>{title}</span>
      </div>

      <div className="chat-risk-main">
        <span className="chat-risk-level">{meta.label}</span>
        <span className="chat-risk-score">
          {Math.round(score)}
          <span className="chat-risk-score-unit">/100</span>
        </span>
      </div>

      {description && <p className="chat-risk-description">{description}</p>}
    </div>
  );
}

function ZonesBlock({ zones }: { zones: ChatZoneSummary[] }) {
  if (zones.length === 0) {
    return null;
  }

  return (
    <div className="chat-structured-block">
      <span className="chat-structured-label">Recommended zones</span>

      <div className="chat-zones-list">
        {zones.map((zone) => (
          <div
            key={zone.name}
            className={`chat-zone-row chat-zone-${zone.recommendation.toLowerCase()}`}
          >
            <div className="chat-zone-top">
              <span className="chat-zone-name">{zone.name}</span>
              <span className="chat-zone-badge">{zone.recommendation}</span>
            </div>

            {zone.suitability && (
              <span className="chat-zone-suitability">{zone.suitability}</span>
            )}

            {zone.reasons && zone.reasons.length > 0 && (
              <ul>
                {zone.reasons.slice(0, 2).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RouteChips({ route }: { route: ChatRouteSummary }) {
  const chips: Array<{ label: string; value: string }> = [];

  if (typeof route.distanceKm === "number") {
    chips.push({ label: "Distance", value: formatDistance(route.distanceKm) });
  }

  if (typeof route.durationHours === "number") {
    chips.push({ label: "Est. time", value: formatDuration(route.durationHours) });
  }

  if (route.status) {
    chips.push({
      label: "Status",
      value: route.status.charAt(0).toUpperCase() + route.status.slice(1),
    });
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="chat-route-chips">
      {chips.map((chip) => (
        <div key={chip.label} className="chat-route-chip">
          <span className="chat-route-chip-label">{chip.label}</span>
          <span className="chat-route-chip-value">{chip.value}</span>
        </div>
      ))}
    </div>
  );
}

function WhatIfCompare({ comparison }: { comparison: ChatWhatIfComparison }) {
  const beforeTone = normalizeRiskTone(comparison.before.riskLevel);
  const afterTone = normalizeRiskTone(comparison.after.riskLevel);

  return (
    <div className="chat-structured-block">
      <span className="chat-structured-label">What if: {comparison.question}</span>

      <div className="chat-whatif-compare">
        <div className={`chat-whatif-col chat-risk-${beforeTone}`}>
          <span className="chat-whatif-col-label">Current</span>
          <span className="chat-whatif-col-value">
            {Math.round(comparison.before.riskScore)}
            <span className="chat-risk-score-unit">/100</span>
          </span>
        </div>

        <ArrowRight
          className="chat-whatif-arrow"
          size={16}
          strokeWidth={2}
          aria-hidden="true"
        />

        <div className={`chat-whatif-col chat-risk-${afterTone}`}>
          <span className="chat-whatif-col-label">Scenario result</span>
          <span className="chat-whatif-col-value">
            {Math.round(comparison.after.riskScore)}
            <span className="chat-risk-score-unit">/100</span>
          </span>
        </div>
      </div>

      {comparison.impact && (
        <p className="chat-whatif-impact">{comparison.impact}</p>
      )}
    </div>
  );
}

export default function ChatStructuredPanel({
  data,
}: {
  data: ChatStructuredData;
}) {
  const hasRisk =
    typeof data.riskScore === "number" && Boolean(data.riskLevel);

  const hasZones = Boolean(data.zones && data.zones.length > 0);
  const hasRoute = Boolean(
    data.route &&
      (typeof data.route.distanceKm === "number" ||
        typeof data.route.durationHours === "number" ||
        data.route.status)
  );

  const hasFactors = Boolean(data.keyFactors && data.keyFactors.length > 0);
  const hasEvidence = Boolean(
    data.evidenceTitles && data.evidenceTitles.length > 0
  );
  const hasWhatIfCompare = Boolean(data.whatIfComparison);
  const hasWhatIfSummary = Boolean(!hasWhatIfCompare && data.whatIfSummary);

  const hasActions = Boolean(data.actions && data.actions.length > 0);

  if (
    !hasRisk &&
    !hasZones &&
    !hasRoute &&
    !hasFactors &&
    !hasEvidence &&
    !hasWhatIfCompare &&
    !hasWhatIfSummary &&
    !hasActions
  ) {
    return null;
  }

  return (
    <div className="chat-structured">
      {/* A zone recommendation list already conveys per-zone
          suitability - a generic area-wide score alongside it would
          read as contradicting that, so the two never render together. */}
      {hasRisk && !hasZones && (
        <RiskBlock level={data.riskLevel} score={data.riskScore} />
      )}

      {hasZones && <ZonesBlock zones={data.zones!} />}

      {hasRoute && <RouteChips route={data.route!} />}

      {hasFactors && (
        <div className="chat-structured-block">
          <span className="chat-structured-label">Why</span>
          <ul>
            {data.keyFactors!.slice(0, 4).map((factor) => (
              <li key={factor}>{factor}</li>
            ))}
          </ul>
        </div>
      )}

      {hasWhatIfCompare && (
        <WhatIfCompare comparison={data.whatIfComparison!} />
      )}

      {hasWhatIfSummary && (
        <div className="chat-structured-whatif">
          <Sparkles size={13} />
          <span>{data.whatIfSummary}</span>
        </div>
      )}

      {hasEvidence && (
        <div className="chat-structured-block">
          <span className="chat-structured-label">Evidence &amp; sources</span>
          <ul className="chat-evidence-list">
            {data.evidenceTitles!.slice(0, 4).map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ul>
        </div>
      )}

      {hasActions && (
        <div className="chat-structured-actions">
          {data.actions!.map((action) => (
            <button
              key={action.label}
              type="button"
              className="chat-structured-map-action"
              onClick={action.onClick}
            >
              <MapPinned size={13} />
              {action.label}
              <ArrowRight size={13} strokeWidth={2.4} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      <style>{`
        .chat-structured {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid var(--chat-border, #e3e7eb);
        }

        /* Risk / decision block - a neutral surface with only a thin
           semantic accent (border + the level word itself), never a
           full colored wash. Sagar's normal UI is navy/teal/neutral;
           color here is reserved for signalling the risk level, not
           for decorating the card. */

        .chat-risk-block {
          padding: 10px 12px;
          border-left: 3px solid var(--chat-border, #e3e7eb);
          border-radius: 8px;
          background: var(--chat-surface-alt, #f6f8fa);
        }

        .chat-risk-top {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--chat-text-faint, #8894a0);
          font-size: 9.5px;
          font-weight: 800;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        .chat-risk-main {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
          margin-top: 5px;
        }

        .chat-risk-level {
          color: var(--chat-text, #14202b);
          font-size: 16px;
          font-weight: 800;
          letter-spacing: -0.2px;
        }

        .chat-risk-score {
          color: var(--chat-text, #14202b);
          font-size: 18px;
          font-weight: 800;
          letter-spacing: -0.3px;
        }

        .chat-risk-score-unit {
          margin-left: 1px;
          color: var(--chat-text-muted, #5b6b7a);
          font-size: 11px;
          font-weight: 600;
        }

        .chat-risk-description {
          margin: 4px 0 0;
          color: var(--chat-text-secondary, #384652);
          font-size: 12px;
          line-height: 17px;
        }

        .chat-risk-low {
          border-left-color: #159a68;
        }

        .chat-risk-low .chat-risk-top,
        .chat-risk-low .chat-risk-level,
        .chat-risk-low .chat-whatif-col-value {
          color: #0f7a4f;
        }

        .chat-risk-moderate {
          border-left-color: #c98700;
        }

        .chat-risk-moderate .chat-risk-top,
        .chat-risk-moderate .chat-risk-level,
        .chat-risk-moderate .chat-whatif-col-value {
          color: #93650a;
        }

        .chat-risk-high {
          border-left-color: #d64545;
        }

        .chat-risk-high .chat-risk-top,
        .chat-risk-high .chat-risk-level,
        .chat-risk-high .chat-whatif-col-value {
          color: #b5372f;
        }

        .chat-risk-critical {
          border-left-color: #9f1d2f;
        }

        .chat-risk-critical .chat-risk-top,
        .chat-risk-critical .chat-risk-level,
        .chat-risk-critical .chat-whatif-col-value {
          color: #8a1a29;
        }

        .chat-risk-unknown {
          border-left-color: var(--chat-border-strong, #d3dae0);
        }

        /* Shared section label */

        .chat-structured-block {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .chat-structured-label {
          color: var(--chat-text-faint, #8894a0);
          font-size: 9.5px;
          font-weight: 800;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        .chat-structured-block ul {
          margin: 0;
          padding-left: 16px;
          color: var(--chat-text-secondary, #384652);
          font-size: 13px;
          line-height: 20px;
        }

        .chat-structured-block li {
          margin-bottom: 3px;
        }

        .chat-structured-block li:last-child {
          margin-bottom: 0;
        }

        .chat-evidence-list {
          color: var(--chat-text-muted, #5b6b7a) !important;
          font-size: 12px !important;
          line-height: 18px !important;
        }

        /* PFZ zone rows */

        .chat-zones-list {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .chat-zone-row {
          padding: 8px 10px;
          border-left: 3px solid var(--chat-border, #e3e7eb);
          border-radius: 8px;
          background: var(--chat-surface-alt, #f6f8fa);
        }

        .chat-zone-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .chat-zone-name {
          color: var(--chat-text, #14202b);
          font-size: 13px;
          font-weight: 700;
        }

        .chat-zone-badge {
          flex: 0 0 auto;
          padding: 2px 7px;
          border-radius: 999px;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.04em;
        }

        .chat-zone-prefer {
          border-left-color: #159a68;
        }

        .chat-zone-prefer .chat-zone-badge {
          background: #e8f7f0;
          color: #0f7a4f;
        }

        .chat-zone-monitor {
          border-left-color: #c98700;
        }

        .chat-zone-monitor .chat-zone-badge {
          background: #fff4da;
          color: #93650a;
        }

        .chat-zone-avoid {
          border-left-color: #d64545;
        }

        .chat-zone-avoid .chat-zone-badge {
          background: #fdeceb;
          color: #b5372f;
        }

        .chat-zone-suitability {
          display: block;
          margin-top: 3px;
          color: var(--chat-text-muted, #5b6b7a);
          font-size: 11.5px;
        }

        .chat-zone-row ul {
          margin: 5px 0 0;
          padding-left: 14px;
          color: var(--chat-text-secondary, #384652);
          font-size: 11.5px;
          line-height: 16px;
        }

        /* Route chips */

        .chat-route-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .chat-route-chip {
          display: flex;
          flex-direction: column;
          gap: 1px;
          padding: 6px 10px;
          border: 1px solid var(--chat-border, #e3e7eb);
          border-radius: 9px;
          background: var(--chat-surface-alt, #f6f8fa);
        }

        .chat-route-chip-label {
          color: var(--chat-text-faint, #8894a0);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .chat-route-chip-value {
          color: var(--chat-text, #14202b);
          font-size: 12.5px;
          font-weight: 700;
        }

        /* What-if comparison */

        .chat-whatif-compare {
          display: flex;
          align-items: stretch;
          gap: 8px;
        }

        .chat-whatif-col {
          flex: 1 1 0;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 8px 10px;
          border-left: 3px solid var(--chat-border, #e3e7eb);
          border-radius: 8px;
          background: var(--chat-surface-alt, #f6f8fa);
        }

        .chat-whatif-col-label {
          color: var(--chat-text-faint, #8894a0);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .chat-whatif-col-value {
          color: var(--chat-text, #14202b);
          font-size: 16px;
          font-weight: 800;
        }

        .chat-whatif-arrow {
          flex: 0 0 auto;
          align-self: center;
          color: var(--chat-text-faint, #8894a0);
        }

        .chat-whatif-impact {
          margin: 8px 0 0;
          color: var(--chat-text-secondary, #384652);
          font-size: 12.5px;
          line-height: 18px;
        }

        /* Deterministic-fallback what-if text (no structured comparison) */

        .chat-structured-whatif {
          display: flex;
          align-items: flex-start;
          gap: 7px;
          padding: 9px 10px;
          border-radius: 10px;
          background: var(--chat-accent-soft, rgba(15, 110, 100, 0.08));
          color: var(--chat-text-secondary, #26333d);
          font-size: 12px;
          line-height: 18px;
        }

        .chat-structured-whatif svg {
          flex: 0 0 auto;
          margin-top: 2px;
          color: var(--chat-accent, #0f6e64);
        }

        /* Actions */

        .chat-structured-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 2px;
        }

        .chat-structured-map-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 34px;
          padding: 0 13px;
          border: 1px solid var(--chat-accent, #0f6e64);
          border-radius: 999px;
          background: var(--chat-surface, #ffffff);
          color: var(--chat-accent, #0f6e64);
          font-family: inherit;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: background-color 140ms ease, transform 140ms ease;
        }

        .chat-structured-map-action:hover {
          background: var(--chat-accent-soft, rgba(15, 110, 100, 0.08));
          transform: translateY(-1px);
        }

        .chat-structured-map-action:active {
          transform: translateY(0);
        }

        @media (max-width: 700px) {
          .chat-whatif-compare {
            flex-direction: column;
          }

          .chat-whatif-arrow {
            align-self: flex-start;
            transform: rotate(90deg);
          }

          .chat-structured-actions {
            flex-direction: column;
          }

          .chat-structured-map-action {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
