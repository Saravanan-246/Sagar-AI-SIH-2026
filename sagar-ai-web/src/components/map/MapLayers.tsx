import React from "react";

export type MapLayerKey = "conditions" | "pfz" | "hazards" | "weather" | "routes";

export interface MapLayersProps {
  activeLayers: Record<MapLayerKey, boolean>;
  onToggle: (layer: MapLayerKey) => void;
}

interface LayerItem {
  key: MapLayerKey;
  label: string;
  icon: string;
  color: string;
}

const LAYERS: LayerItem[] = [
  { key: "conditions", label: "Sea Conditions", icon: "🌊", color: "#2563EB" },
  { key: "pfz", label: "Fishing Zones", icon: "🐟", color: "#059669" },
  { key: "hazards", label: "Hazards", icon: "⚠️", color: "#DC2626" },
  { key: "weather", label: "Weather", icon: "🌩️", color: "#7C3AED" },
  { key: "routes", label: "Routes", icon: "🧭", color: "#D97706" },
];

export default function MapLayers({ activeLayers = { conditions: false, pfz: false, hazards: false, weather: false, routes: false }, onToggle }: MapLayersProps) {
  const activeCount = Object.values(activeLayers).filter(Boolean).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%", userSelect: "none" }}>
      {/* Header with real-time active counter */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "4px 6px 8px 6px",
          borderBottom: "1px solid #edf2f7",
        }}
      >
        <span style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>Map Layers</span>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            background: activeCount > 0 ? "#eff6ff" : "#f1f5f9",
            color: activeCount > 0 ? "#2563EB" : "#64748b",
            padding: "2px 8px",
            borderRadius: "12px",
            transition: "all 0.2s ease",
          }}
        >
          {activeCount} active
        </span>
      </div>

      {/* Layer Toggle Buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {LAYERS.map((layer) => {
          const isActive = Boolean(activeLayers[layer.key]);

          return (
            <button
              key={layer.key}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(layer.key);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "9px 12px",
                borderRadius: "10px",
                border: "1px solid",
                borderColor: isActive ? `${layer.color}40` : "transparent",
                background: isActive ? `${layer.color}0D` : "#f8fafc",
                cursor: "pointer",
                transition: "all 0.15s ease",
                width: "100%",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "15px", lineHeight: 1 }}>{layer.icon}</span>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? "#0f172a" : "#475569",
                  }}
                >
                  {layer.label}
                </span>
              </div>

              {/* Status Radio / Indicator Dot */}
              <div
                style={{
                  width: "14px",
                  height: "14px",
                  borderRadius: "50%",
                  border: `2px solid ${isActive ? layer.color : "#cbd5e1"}`,
                  background: isActive ? layer.color : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.15s ease",
                }}
              >
                {isActive && (
                  <div
                    style={{
                      width: "4px",
                      height: "4px",
                      borderRadius: "50%",
                      background: "#ffffff",
                    }}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}