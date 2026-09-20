import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Compass,
  MapPin,
  Waves,
  Wind,
} from "lucide-react";

import "./MarineSummary.css";

export type MarineSummaryStatus =
  | "favourable"
  | "caution"
  | "hazard"
  | "unknown";

export type MarineSummaryData = {
  areaName: string;
  coordinates?: string;
  status: MarineSummaryStatus;
  headline: string;
  summary: string;
  waveHeight?: string;
  windSpeed?: string;
  seaState?: string;
  updatedAt?: string;
};

type MarineSummaryProps = {
  data: MarineSummaryData;
  onOpenMap?: () => void;
};

const statusConfig = {
  favourable: {
    label: "Favourable",
    icon: CheckCircle2,
    className: "marine-summary-favourable",
  },
  caution: {
    label: "Caution",
    icon: Compass,
    className: "marine-summary-caution",
  },
  hazard: {
    label: "Hazard",
    icon: AlertTriangle,
    className: "marine-summary-hazard",
  },
  unknown: {
    label: "Unavailable",
    icon: Clock3,
    className: "marine-summary-unknown",
  },
} as const;

export default function MarineSummary({
  data,
  onOpenMap,
}: MarineSummaryProps) {
  const status = statusConfig[data.status];
  const StatusIcon = status.icon;

  return (
    <section className="marine-summary">
      <div className="marine-summary-header">
        <div className="marine-summary-location">
          <div className="marine-summary-location-icon">
            <MapPin size={17} strokeWidth={2} />
          </div>

          <div className="marine-summary-location-copy">
            <span className="marine-summary-eyebrow">
              SELECTED AREA
            </span>

            <h2 className="marine-summary-area">
              {data.areaName}
            </h2>

            {data.coordinates && (
              <span className="marine-summary-coordinates">
                {data.coordinates}
              </span>
            )}
          </div>
        </div>

        <span
          className={[
            "marine-summary-status",
            status.className,
          ].join(" ")}
        >
          <StatusIcon
            size={14}
            strokeWidth={2.2}
          />

          {status.label}
        </span>
      </div>

      <div className="marine-summary-main">
        <div className="marine-summary-copy">
          <h3 className="marine-summary-headline">
            {data.headline}
          </h3>

          <p className="marine-summary-text">
            {data.summary}
          </p>

          {onOpenMap && (
            <button
              type="button"
              className="marine-summary-map-button"
              onClick={onOpenMap}
            >
              <MapPin size={15} strokeWidth={2} />
              View on map
            </button>
          )}
        </div>

        <div className="marine-summary-metrics">
          <SummaryMetric
            icon={Waves}
            label="Wave"
            value={data.waveHeight ?? "—"}
          />

          <SummaryMetric
            icon={Wind}
            label="Wind"
            value={data.windSpeed ?? "—"}
          />

          <SummaryMetric
            icon={Compass}
            label="Sea state"
            value={data.seaState ?? "—"}
          />
        </div>
      </div>

      {data.updatedAt && (
        <div className="marine-summary-footer">
          <Clock3 size={13} strokeWidth={2} />
          <span>Updated {data.updatedAt}</span>
        </div>
      )}
    </section>
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Waves;
  label: string;
  value: string;
}) {
  return (
    <div className="marine-summary-metric">
      <div className="marine-summary-metric-icon">
        <Icon size={15} strokeWidth={2} />
      </div>

      <div className="marine-summary-metric-copy">
        <span className="marine-summary-metric-label">
          {label}
        </span>

        <span className="marine-summary-metric-value">
          {value}
        </span>
      </div>
    </div>
  );
}