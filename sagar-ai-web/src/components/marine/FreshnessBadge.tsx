import type { DataState } from "../../utils/freshness";

import "./MarineMetric.css";

const LABELS: Record<DataState, string> = {
  LIVE: "Live",
  RECENT: "Recent",
  STALE: "Stale",
  UNAVAILABLE: "Unavailable",
  FALLBACK: "Fallback",
};

const DESCRIPTIONS: Record<DataState, string> = {
  LIVE: "Observation from the last few minutes",
  RECENT: "Within the source's normal update cycle",
  STALE: "Older than the source's normal update cycle - not current",
  UNAVAILABLE: "Source could not be reached or returned no value",
  FALLBACK: "Sagar's configured prototype dataset - not a measurement of current conditions",
};

export default function FreshnessBadge({ state }: { state: DataState }) {
  return (
    <span
      className={`freshness-badge freshness-badge-${state.toLowerCase()}`}
      title={DESCRIPTIONS[state]}
    >
      {LABELS[state]}
    </span>
  );
}
