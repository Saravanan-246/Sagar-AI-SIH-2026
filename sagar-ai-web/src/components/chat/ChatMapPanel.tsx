import { Map as MapIcon, Maximize2 } from "lucide-react";

import MarineMap from "../map/MarineMap";
import type { ChatMapFocus } from "../../utils/chatMapFocus";
import type { MarineArea } from "../../types/marine";

import "./ChatMapPanel.css";

type ChatMapPanelProps = {
  focus: ChatMapFocus | null;
  areas: MarineArea[];
  /** Desktop panel renders inline; mobile renders a compact card that
   * expands the same map full-screen instead, so Leaflet only ever
   * mounts once per surface rather than duplicating map instances. */
  variant: "inline" | "card";
  onExpand?: () => void;
};

const FOCUS_LABEL: Record<ChatMapFocus["kind"], string> = {
  route: "Route",
  zone: "Fishing zone",
  alert: "Marine hazard",
  area: "Marine area",
};

export default function ChatMapPanel({
  focus,
  areas,
  variant,
  onExpand,
}: ChatMapPanelProps) {
  if (variant === "card") {
    if (!focus) {
      return null;
    }

    return (
      <button
        type="button"
        className="chat-map-card"
        onClick={onExpand}
      >
        <span className="chat-map-card-icon">
          <MapIcon size={15} />
        </span>

        <span className="chat-map-card-text">
          <strong>{FOCUS_LABEL[focus.kind]}</strong>
          <span>{focus.highlight?.label ?? focus.areaName ?? "View on map"}</span>
        </span>

        <span className="chat-map-card-expand">
          <Maximize2 size={14} />
        </span>
      </button>
    );
  }

  const title = focus
    ? (focus.highlight?.label ?? focus.areaName ?? FOCUS_LABEL[focus.kind])
    : "Contextual view";

  return (
    <div className="chat-map-panel">
      <div className="chat-map-panel-header">
        <div className="chat-map-panel-eyebrow">
          <MapIcon size={12} />
          <span>Marine map{focus ? ` · ${FOCUS_LABEL[focus.kind]}` : ""}</span>
        </div>

        <div className="chat-map-panel-title">{title}</div>
      </div>

      <div className="chat-map-panel-canvas">
        <MarineMap
          areas={areas}
          center={focus?.center}
          zoom={focus?.zoom}
          highlight={focus?.highlight ?? null}
          alerts={focus?.alerts}
          overrideRoutes={focus?.route ? [focus.route] : undefined}
          startPoint={focus?.route?.origin ?? null}
          endPoint={focus?.route?.destination ?? null}
          showStatusPill={false}
        />
      </div>
    </div>
  );
}
