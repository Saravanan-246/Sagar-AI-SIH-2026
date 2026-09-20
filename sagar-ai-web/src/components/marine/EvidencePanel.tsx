import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  Info,
} from "lucide-react";

import "./EvidencePanel.css";

export type EvidenceItem = {
  id: string;
  source: string;
  title: string;
  value?: string;
  detail?: string;
  timestamp?: string;
  status?: "available" | "stale" | "unavailable";
};

type EvidencePanelProps = {
  items: EvidenceItem[];
  title?: string;
  compact?: boolean;
};

const statusLabel = {
  available: "Available",
  stale: "Stale",
  unavailable: "Unavailable",
} as const;

export default function EvidencePanel({
  items,
  title = "Supporting evidence",
  compact = false,
}: EvidencePanelProps) {
  if (items.length === 0) {
    return (
      <section className="evidence-panel evidence-panel-empty">
        <div className="evidence-panel-heading">
          <Info size={17} strokeWidth={2} />
          <span>{title}</span>
        </div>

        <p>
          Supporting evidence is not available for this
          decision yet.
        </p>
      </section>
    );
  }

  return (
    <section
      className={[
        "evidence-panel",
        compact ? "evidence-panel-compact" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="evidence-panel-header">
        <div className="evidence-panel-heading">
          <Info size={17} strokeWidth={2} />
          <span>{title}</span>
        </div>

        <span className="evidence-count">
          {items.length}
        </span>
      </div>

      <div className="evidence-list">
        {items.map((item) => {
          const status = item.status ?? "available";

          return (
            <article
              key={item.id}
              className="evidence-item"
            >
              <div className="evidence-item-main">
                <div className="evidence-source">
                  <CheckCircle2
                    size={14}
                    strokeWidth={2.2}
                  />

                  <span>{item.source}</span>
                </div>

                <h3 className="evidence-title">
                  {item.title}
                </h3>

                {item.detail && (
                  <p className="evidence-detail">
                    {item.detail}
                  </p>
                )}
              </div>

              <div className="evidence-item-side">
                {item.value && (
                  <span className="evidence-value">
                    {item.value}
                  </span>
                )}

                <span
                  className={[
                    "evidence-status",
                    `evidence-status-${status}`,
                  ].join(" ")}
                >
                  {statusLabel[status]}
                </span>

                {item.timestamp && (
                  <span className="evidence-time">
                    <Clock3
                      size={11}
                      strokeWidth={2}
                    />
                    {item.timestamp}
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}