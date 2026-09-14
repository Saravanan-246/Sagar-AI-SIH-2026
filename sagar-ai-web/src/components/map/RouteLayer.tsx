import {
  CircleMarker,
  Popup,
  Polyline,
} from "react-leaflet";

export type RoutePoint = {
  latitude: number;
  longitude: number;
};

type RouteLayerProps = {
  points: RoutePoint[];
  visible?: boolean;
  color?: string;
  onSelect?: () => void;
};

export default function RouteLayer({
  points,
  visible = true,
  color = "#6D28D9",
  onSelect,
}: RouteLayerProps) {
  if (!visible || points.length < 2) {
    return null;
  }

  const positions: [number, number][] =
    points.map((point) => [
      point.latitude,
      point.longitude,
    ]);

  const start = positions[0];
  const end = positions[positions.length - 1];

  return (
    <>
      <Polyline
        positions={positions}
        pathOptions={{
          color,
          weight: 4,
          opacity: 0.9,
          lineCap: "round",
          lineJoin: "round",
        }}
        eventHandlers={{
          click: () => onSelect?.(),
        }}
      />

      <CircleMarker
        center={start}
        radius={7}
        pathOptions={{
          color: "#FFFFFF",
          fillColor: "#159A68",
          fillOpacity: 1,
          weight: 3,
        }}
      >
        <Popup>
          <div className="route-popup">
            <strong>Departure</strong>
          </div>
        </Popup>
      </CircleMarker>

      <CircleMarker
        center={end}
        radius={7}
        pathOptions={{
          color: "#FFFFFF",
          fillColor: "#6D28D9",
          fillOpacity: 1,
          weight: 3,
        }}
      >
        <Popup>
          <div className="route-popup">
            <strong>Destination</strong>
          </div>
        </Popup>
      </CircleMarker>
    </>
  );
}