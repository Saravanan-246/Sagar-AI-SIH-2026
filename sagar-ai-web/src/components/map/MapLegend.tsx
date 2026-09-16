import type { MapLayerKey } from "./MapLayers";

type LegendShape = "dot" | "square" | "line" | "line-dashed";

type LegendEntry = {
  color: string;
  label: string;
  shape: LegendShape;
};

type LegendGroup = {
  title: string;
  entries: LegendEntry[];
};

type MapLegendProps = {
  activeLayers: Record<MapLayerKey, boolean>;
};

/**
 * Built entirely from the same layer-toggle state that controls what
 * the map actually renders - a layer switched off drops its section
 * here too, so the legend can never drift out of sync with what's on
 * screen or list a category nothing on the map uses.
 */
export default function MapLegend({ activeLayers }: MapLegendProps) {
  const groups: LegendGroup[] = [];

  if (activeLayers.conditions) {
    groups.push({
      title: "Marine areas",
      entries: [{ color: "#0f6e64", label: "Monitoring station", shape: "dot" }],
    });
  }

  if (activeLayers.alerts) {
    groups.push({
      title: "Active alerts",
      entries: [
        { color: "#9f1d2f", label: "Critical", shape: "dot" },
        { color: "#d64545", label: "High", shape: "dot" },
        { color: "#c98700", label: "Moderate", shape: "dot" },
        { color: "#159a68", label: "Low", shape: "dot" },
      ],
    });
  }

  if (activeLayers.pfz) {
    groups.push({
      title: "Fishing zones",
      entries: [
        { color: "#159a68", label: "Prefer", shape: "square" },
        { color: "#c98700", label: "Monitor", shape: "square" },
        { color: "#d64545", label: "Avoid", shape: "square" },
      ],
    });
  }

  if (activeLayers.boundaries) {
    groups.push({
      title: "Boundaries",
      entries: [
        { color: "#5b6b7a", label: "Restricted / regulated area", shape: "square" },
      ],
    });
  }

  if (activeLayers.routes) {
    groups.push({
      title: "Routes",
      entries: [
        { color: "#159a68", label: "Preferred", shape: "line" },
        { color: "#c98700", label: "Caution", shape: "line" },
        { color: "#d64545", label: "Avoid", shape: "line-dashed" },
      ],
    });
  }

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="map-legend">
      <span className="map-legend-heading">Legend</span>

      {groups.map((group) => (
        <div key={group.title} className="map-legend-group">
          <span className="map-legend-group-title">{group.title}</span>

          <div className="map-legend-entries">
            {group.entries.map((entry) => (
              <span key={entry.label} className="map-legend-entry">
                <span
                  className={`map-legend-swatch map-legend-swatch-${entry.shape}`}
                  style={
                    entry.shape === "line" || entry.shape === "line-dashed"
                      ? { borderTopColor: entry.color }
                      : { background: entry.color }
                  }
                  aria-hidden="true"
                />
                {entry.label}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
