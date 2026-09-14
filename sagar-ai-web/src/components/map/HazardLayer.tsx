import {
  Circle,
  Marker,
  Popup,
} from "react-leaflet";

import type { LatLngExpression } from "leaflet";

export type Hazard = {
  id: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  title: string;
  severity: "low" | "moderate" | "high" | "critical";
  description: string;
};

type HazardLayerProps = {
  hazards: Hazard[];
  visible?: boolean;
  onSelect?: (hazard: Hazard) => void;
};

const severityStyles = {
  low: {
    stroke: "#159A68",
    fill: "#159A68",
  },
  moderate: {
    stroke: "#C98700",
    fill: "#C98700",
  },
  high: {
    stroke: "#D64545",
    fill: "#D64545",
  },
  critical: {
    stroke: "#9F1D2F",
    fill: "#9F1D2F",
  },
} as const;

export default function HazardLayer({
  hazards,
  visible = true,
  onSelect,
}: HazardLayerProps) {
  if (!visible || hazards.length === 0) {
    return null;
  }

  return (
    <>
      {hazards.map((hazard) => {
        const position: LatLngExpression = [
          hazard.latitude,
          hazard.longitude,
        ];

        const style = severityStyles[hazard.severity];

        return (
          <div key={hazard.id}>
            <Circle
              center={position}
              radius={hazard.radiusKm * 1000}
              pathOptions={{
                color: style.stroke,
                fillColor: style.fill,
                fillOpacity: 0.12,
                weight: 2,
                opacity: 0.75,
              }}
            />

            <Marker
              position={position}
              eventHandlers={{
                click: () => onSelect?.(hazard),
              }}
            >
              <Popup>
                <div className="hazard-popup">
                  <div className="hazard-popup-title">
                    {hazard.title}
                  </div>

                  <div className="hazard-popup-severity">
                    {hazard.severity.toUpperCase()}
                  </div>

                  <div className="hazard-popup-description">
                    {hazard.description}
                  </div>

                  <div className="hazard-popup-radius">
                    Affected area: {hazard.radiusKm} km
                  </div>
                </div>
              </Popup>
            </Marker>
          </div>
        );
      })}
    </>
  );
}