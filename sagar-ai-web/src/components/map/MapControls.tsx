import {
  LocateFixed,
  Layers3,
  Minus,
  Plus,
} from "lucide-react";

type MapControlsProps = {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onLocate?: () => void;
  onLayers?: () => void;
};

export default function MapControls({
  onZoomIn,
  onZoomOut,
  onLocate,
  onLayers,
}: MapControlsProps) {
  return (
    <div className="map-controls">
      <div className="map-control-group">
        <button
          type="button"
          className="map-control-button"
          onClick={onZoomIn}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Plus size={18} strokeWidth={2.1} />
        </button>

        <div className="map-control-divider" />

        <button
          type="button"
          className="map-control-button"
          onClick={onZoomOut}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus size={18} strokeWidth={2.1} />
        </button>
      </div>

      <button
        type="button"
        className="map-control-single"
        onClick={onLocate}
        aria-label="Center map on my location"
        title="My location"
      >
        <LocateFixed size={18} strokeWidth={2} />
      </button>

      <button
        type="button"
        className="map-control-single"
        onClick={onLayers}
        aria-label="Open map layers"
        title="Map layers"
      >
        <Layers3 size={18} strokeWidth={2} />
      </button>
    </div>
  );
}