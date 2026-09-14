import {
  Circle,
  Popup,
  Polygon,
} from "react-leaflet";

export type PFZZone = {
  id: string;
  name: string;
  center: [number, number];
  radiusKm?: number;
  polygon?: [number, number][];
  suitability: "favourable" | "moderate" | "low";
  description?: string;
};

type PFZLayerProps = {
  zones: PFZZone[];
  visible?: boolean;
  onSelect?: (zone: PFZZone) => void;
};

const suitabilityStyle = {
  favourable: {
    color: "#159A68",
    fillColor: "#159A68",
  },
  moderate: {
    color: "#C98700",
    fillColor: "#C98700",
  },
  low: {
    color: "#8B5CF6",
    fillColor: "#8B5CF6",
  },
} as const;

export default function PFZLayer({
  zones,
  visible = true,
  onSelect,
}: PFZLayerProps) {
  if (!visible || zones.length === 0) {
    return null;
  }

  return (
    <>
      {zones.map((zone) => {
        const style = suitabilityStyle[zone.suitability];

        if (zone.polygon && zone.polygon.length >= 3) {
          return (
            <Polygon
              key={zone.id}
              positions={zone.polygon}
              pathOptions={{
                color: style.color,
                fillColor: style.fillColor,
                fillOpacity: 0.16,
                weight: 2,
                opacity: 0.8,
              }}
              eventHandlers={{
                click: () => onSelect?.(zone),
              }}
            >
              <Popup>
                <div className="pfz-popup">
                  <div className="pfz-popup-title">
                    {zone.name}
                  </div>

                  <div
                    className={`pfz-popup-badge pfz-popup-${zone.suitability}`}
                  >
                    {zone.suitability}
                  </div>

                  {zone.description && (
                    <div className="pfz-popup-description">
                      {zone.description}
                    </div>
                  )}
                </div>
              </Popup>
            </Polygon>
          );
        }

        return (
          <Circle
            key={zone.id}
            center={zone.center}
            radius={(zone.radiusKm ?? 5) * 1000}
            pathOptions={{
              color: style.color,
              fillColor: style.fillColor,
              fillOpacity: 0.16,
              weight: 2,
              opacity: 0.8,
            }}
            eventHandlers={{
              click: () => onSelect?.(zone),
            }}
          >
            <Popup>
              <div className="pfz-popup">
                <div className="pfz-popup-title">
                  {zone.name}
                </div>

                <div
                  className={`pfz-popup-badge pfz-popup-${zone.suitability}`}
                >
                  {zone.suitability}
                </div>

                {zone.description && (
                  <div className="pfz-popup-description">
                    {zone.description}
                  </div>
                )}
              </div>
            </Popup>
          </Circle>
        );
      })}
    </>
  );
}