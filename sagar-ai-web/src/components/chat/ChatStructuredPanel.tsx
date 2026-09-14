import { MapPinned, ShieldAlert, Sparkles } from "lucide-react";

import Badge from "../ui/Badge";

export type ChatMapAction = {
  label: string;
  onClick: () => void;
};

export type ChatStructuredData = {
  riskLevel?: string;
  riskScore?: number;
  keyFactors?: string[];
  evidenceTitles?: string[];
  whatIfSummary?: string;
  mapAction?: ChatMapAction;
};

function riskTone(level?: string) {
  switch (level) {
    case "low":
      return "success" as const;
    case "moderate":
      return "warning" as const;
    case "high":
    case "critical":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

export default function ChatStructuredPanel({
  data,
}: {
  data: ChatStructuredData;
}) {
  const hasRisk =
    typeof data.riskScore === "number" && Boolean(data.riskLevel);

  const hasFactors = Boolean(data.keyFactors && data.keyFactors.length > 0);
  const hasEvidence = Boolean(
    data.evidenceTitles && data.evidenceTitles.length > 0
  );

  if (
    !hasRisk &&
    !hasFactors &&
    !hasEvidence &&
    !data.whatIfSummary &&
    !data.mapAction
  ) {
    return null;
  }

  return (
    <div className="chat-structured">
      {hasRisk && (
        <div className="chat-structured-risk">
          <ShieldAlert size={13} />
          <span>Risk</span>
          <Badge tone={riskTone(data.riskLevel)} size="sm">
            {data.riskLevel?.toUpperCase()} · {data.riskScore}/100
          </Badge>
        </div>
      )}

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

      {hasEvidence && (
        <div className="chat-structured-block">
          <span className="chat-structured-label">Evidence</span>
          <ul>
            {data.evidenceTitles!.slice(0, 4).map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ul>
        </div>
      )}

      {data.whatIfSummary && (
        <div className="chat-structured-whatif">
          <Sparkles size={13} />
          <span>{data.whatIfSummary}</span>
        </div>
      )}

      {data.mapAction && (
        <button
          type="button"
          className="chat-structured-map-action"
          onClick={data.mapAction.onClick}
        >
          <MapPinned size={13} />
          {data.mapAction.label}
        </button>
      )}

      <style>{`
        .chat-structured {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 9px;
          padding-top: 9px;
          border-top: 1px solid rgba(109, 40, 217, 0.12);
        }

        .chat-structured-risk {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #6b6875;
          font-size: 10px;
          font-weight: 750;
        }

        .chat-structured-risk svg {
          color: #6d28d9;
        }

        .chat-structured-block {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .chat-structured-label {
          color: #8f8b98;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        .chat-structured-block ul {
          margin: 0;
          padding-left: 14px;
          color: #46424f;
          font-size: 10px;
          line-height: 16px;
        }

        .chat-structured-block li {
          margin-bottom: 1px;
        }

        .chat-structured-whatif {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          padding: 7px 8px;
          border-radius: 8px;
          background: rgba(109, 40, 217, 0.06);
          color: #4b4854;
          font-size: 9px;
          line-height: 14px;
        }

        .chat-structured-whatif svg {
          flex: 0 0 auto;
          margin-top: 1px;
          color: #6d28d9;
        }

        .chat-structured-map-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          align-self: flex-start;
          min-height: 30px;
          padding: 0 12px;
          border: 1px solid #6d28d9;
          border-radius: 999px;
          background: #ffffff;
          color: #6d28d9;
          font-family: inherit;
          font-size: 10px;
          font-weight: 750;
          cursor: pointer;
          transition: background-color 140ms ease;
        }

        .chat-structured-map-action:hover {
          background: #f5f1fe;
        }
      `}</style>
    </div>
  );
}
