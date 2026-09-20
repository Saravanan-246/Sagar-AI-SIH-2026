import {
  LocateFixed,
  Layers3,
  Maximize,
  Minimize,
  Minus,
  Plus,
  Route,
} from "lucide-react";

type MapControlsProps = {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onLocate?: () => void;
  onLayers?: () => void;
  /** Whether a device position has actually been acquired - shows the
   * locate button as "live" rather than idle. */
  isLocated?: boolean;
  /** Present only when a real route is currently on screen to fit to -
   * omit the button entirely rather than showing it disabled. */
  onFitRoute?: () => void;
  onFullscreen?: () => void;
  isFullscreen?: boolean;
};

export default function MapControls({
  onZoomIn,
  onZoomOut,
  onLocate,
  onLayers,
  isLocated = false,
  onFitRoute,
  onFullscreen,
  isFullscreen = false,
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

      {onFitRoute && (
        <button
          type="button"
          className="map-control-single"
          onClick={onFitRoute}
          aria-label="Fit route in view"
          title="Fit route"
        >
          <Route size={17} strokeWidth={2} />
        </button>
      )}

      <button
        type="button"
        className={`map-control-single${isLocated ? " map-control-single-live" : ""}`}
        onClick={onLocate}
        aria-label="Center map on my location"
        aria-pressed={isLocated}
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

      {onFullscreen && (
        <button
          type="button"
          className="map-control-single"
          onClick={onFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          aria-pressed={isFullscreen}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? (
            <Minimize size={17} strokeWidth={2} />
          ) : (
            <Maximize size={17} strokeWidth={2} />
          )}
        </button>
      )}
    </div>
  );
}