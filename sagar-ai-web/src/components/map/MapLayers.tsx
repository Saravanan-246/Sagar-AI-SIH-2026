import {
  Fish,
  Layers3,
  Navigation,
  ShieldAlert,
  Waves,
  type LucideIcon,
} from "lucide-react";

export type MapLayerKey =
  | "conditions"
  | "pfz"
  | "boundaries"
  | "alerts"
  | "routes";

export interface MapLayersProps {
  activeLayers: Record<MapLayerKey, boolean>;
  onToggle: (layer: MapLayerKey) => void;
}

interface LayerItem {
  key: MapLayerKey;
  label: string;
  icon: LucideIcon;
}

const LAYERS: LayerItem[] = [
  { key: "conditions", label: "Marine areas", icon: Waves },
  { key: "pfz", label: "Fishing zones", icon: Fish },
  { key: "alerts", label: "Active alerts", icon: ShieldAlert },
  { key: "boundaries", label: "Boundaries", icon: Layers3 },
  { key: "routes", label: "Routes", icon: Navigation },
];

export default function MapLayers({
  activeLayers,
  onToggle,
}: MapLayersProps) {
  const activeCount = Object.values(activeLayers).filter(Boolean).length;

  return (
    <div className="map-layers">
      <div className="map-layers-header">
        <div className="map-layers-title-wrap">
          <Layers3 size={15} strokeWidth={2} />
          <span>Map layers</span>
        </div>

        <span className="map-layers-count">{activeCount}</span>
      </div>

      <div className="map-layers-list" role="group" aria-label="Map layers">
        {LAYERS.map((layer) => {
          const Icon = layer.icon;
          const isActive = Boolean(activeLayers[layer.key]);

          return (
            <button
              key={layer.key}
              type="button"
              className={`map-layer-item ${isActive ? "map-layer-item-active" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggle(layer.key);
              }}
              role="switch"
              aria-checked={isActive}
            >
              <span className="map-layer-icon">
                <Icon size={16} strokeWidth={2} />
              </span>

              <span className="map-layer-label">{layer.label}</span>

              <span
                className={`map-layer-switch ${isActive ? "map-layer-switch-active" : ""}`}
                aria-hidden="true"
              >
                <span className="map-layer-switch-knob" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
