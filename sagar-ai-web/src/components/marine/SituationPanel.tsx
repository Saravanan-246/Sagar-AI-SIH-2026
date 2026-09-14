import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Info,
  MapPin,
  ShieldAlert,
} from "lucide-react";

export type SituationSeverity =
  | "favourable"
  | "caution"
  | "warning"
  | "critical"
  | "unknown";

type SituationPanelProps = {
  title?: string;
  severity: SituationSeverity;
  headline: string;
  summary: string;
  recommendation?: string;
  area?: string;
  updatedAt?: string;
  onViewMap?: () => void;
};

const severityConfig = {
  favourable: {
    label: "Favourable",
    icon: CheckCircle2,
    className: "situation-favourable",
  },
  caution: {
    label: "Caution",
    icon: Info,
    className: "situation-caution",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    className: "situation-warning",
  },
  critical: {
    label: "Critical",
    icon: ShieldAlert,
    className: "situation-critical",
  },
  unknown: {
    label: "Unavailable",
    icon: Clock3,
    className: "situation-unknown",
  },
} as const;

export default function SituationPanel({
  title = "Marine situation",
  severity,
  headline,
  summary,
  recommendation,
  area,
  updatedAt,
  onViewMap,
}: SituationPanelProps) {
  const config = severityConfig[severity];
  const Icon = config.icon;

  return (
    <section
      className={[
        "situation-panel",
        config.className,
      ].join(" ")}
    >
      <div className="situation-panel-header">
        <div className="situation-panel-heading">
          <div className="situation-panel-icon">
            <Icon size={18} strokeWidth={2.2} />
          </div>

          <div className="situation-panel-heading-copy">
            <span className="situation-panel-title">
              {title}
            </span>

            <span className="situation-panel-severity">
              {config.label}
            </span>
          </div>
        </div>

        {area && (
          <div className="situation-panel-area">
            <MapPin size={13} strokeWidth={2} />
            <span>{area}</span>
          </div>
        )}
      </div>

      <div className="situation-panel-body">
        <h2 className="situation-panel-headline">
          {headline}
        </h2>

        <p className="situation-panel-summary">
          {summary}
        </p>

        {recommendation && (
          <div className="situation-panel-recommendation">
            <span className="situation-panel-recommendation-label">
              Recommended action
            </span>

            <p>{recommendation}</p>
          </div>
        )}
      </div>

      <div className="situation-panel-footer">
        {updatedAt && (
          <div className="situation-panel-updated">
            <Clock3 size={12} strokeWidth={2} />
            <span>{updatedAt}</span>
          </div>
        )}

        {onViewMap && (
          <button
            type="button"
            className="situation-panel-map-action"
            onClick={onViewMap}
          >
            View on map
            <ArrowRight
              size={14}
              strokeWidth={2}
            />
          </button>
        )}
      </div>
    </section>
  );
}