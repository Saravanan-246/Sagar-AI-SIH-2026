type LocationMarkerProps = {
  latitude: number;
  longitude: number;
};

export default function LocationMarker({
  latitude,
  longitude,
}: LocationMarkerProps) {
  return (
    <div
      className="location-marker"
      data-latitude={latitude}
      data-longitude={longitude}
      aria-label={`Current location ${latitude}, ${longitude}`}
    >
      <div className="location-marker-pulse" />
      <div className="location-marker-core" />
    </div>
  );
}