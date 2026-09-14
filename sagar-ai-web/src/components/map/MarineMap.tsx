import "leaflet/dist/leaflet.css";

import { useEffect, useMemo, useState, useCallback } from "react";
import { CircleMarker, MapContainer, Marker, TileLayer, Polyline, Polygon, Popup, useMap } from "react-leaflet";
import { divIcon } from "leaflet";
import type { LatLngExpression, Map as LeafletMap } from "leaflet";

import MapControls from "./MapControls";
import MapLayers, { type MapLayerKey } from "./MapLayers";
import { APP_CONFIG } from "../../constants/config";

import fishingZonesData from "../../data/fishingZones.json";
import routesData from "../../data/routes.json";
import alertsData from "../../data/alerts.json";
import marineData from "../../data/marine.json";
import boundariesData from "../../data/boundaries.json";

import type { RoutePlan } from "../../types/route";

import "./MarineMap.css";

type Coordinates = {
  latitude: number;
  longitude: number;
};

type MarineMapProps = {
  center?: Coordinates;
  zoom?: number;
  onLocationChange?: (location: Coordinates) => void;
  className?: string;

  /**
   * When provided, the routes layer draws exactly these routes (e.g. the
   * planner's calculated options) instead of the full configured route
   * dataset. `selectedRouteId` makes one visually dominant; the rest stay
   * visually secondary. Clicking a route line calls `onSelectRoute`.
   */
  overrideRoutes?: RoutePlan[];
  selectedRouteId?: string | null;
  onSelectRoute?: (routeId: string) => void;

  startPoint?: Coordinates | null;
  endPoint?: Coordinates | null;

  /** Demo-only route simulation marker (never real vessel tracking). */
  journeyPosition?: Coordinates | null;
  journeyBearingDeg?: number;

  /**
   * Marks the specific area/zone/alert Sagar chat handed off to the map
   * (distinct from the user's own device-location marker) so the
   * "View on map" action visibly lands somewhere, not just re-centers.
   */
  highlight?: { latitude: number; longitude: number; label?: string } | null;
};

const DEFAULT_CENTER: LatLngExpression = APP_CONFIG.map.defaultCenter;
const DEFAULT_ZOOM = APP_CONFIG.map.defaultZoom;

/**
 * Normalizes coordinate objects or arrays to Leaflet's [lat, lng].
 * Inverts flipped [lng, lat] pairs automatically for the Tamil Nadu region.
 */
function toLatLng(coord: any): [number, number] | null {
  if (!coord) return null;

  let lat: number | undefined;
  let lng: number | undefined;

  if (Array.isArray(coord) && coord.length >= 2) {
    const [first, second] = coord;
    if (first > 50 && second < 30) {
      lat = second;
      lng = first;
    } else {
      lat = first;
      lng = second;
    }
  } else if (typeof coord === "object") {
    lat = coord.latitude ?? coord.lat;
    lng = coord.longitude ?? coord.lng ?? coord.lon;
  }

  if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) {
    return null;
  }

  return [lat, lng];
}

function MapSyncController({ center, zoom }: { center: LatLngExpression; zoom: number }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !map.getContainer()) return;
    map.setView(center, zoom, { animate: false });
    const timer = setTimeout(() => {
      if (map && map.getContainer()) map.invalidateSize(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [map, center, zoom]);

  return null;
}

/** Fits the view to the currently planned route options so a short
 * corridor is actually visible, instead of a tiny sliver on the full
 * regional view. */
function RouteBoundsController({
  points,
}: {
  points: [number, number][];
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !map.getContainer() || points.length === 0) return;

    const timer = setTimeout(() => {
      if (map && map.getContainer()) {
        map.fitBounds(points, { padding: [48, 48], maxZoom: 11 });
      }
    }, 120);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, JSON.stringify(points)]);

  return null;
}

export default function MarineMap({
  center,
  zoom = DEFAULT_ZOOM,
  onLocationChange,
  className = "",
  overrideRoutes,
  selectedRouteId,
  onSelectRoute,
  startPoint,
  endPoint,
  journeyPosition,
  journeyBearingDeg = 0,
  highlight,
}: MarineMapProps) {
  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);

  const [activeLayers, setActiveLayers] = useState<Record<MapLayerKey, boolean>>({
    conditions: true,
    pfz: true,
    hazards: true,
    weather: false,
    routes: true,
  });

  const mapCenter = useMemo<LatLngExpression>(
    () => (center ? [center.latitude, center.longitude] : DEFAULT_CENTER),
    [center]
  );

  const defaultArea = useMemo(() => {
    const areas = (marineData as any)?.areas;
    return Array.isArray(areas) && areas.length > 0 ? areas[0] : null;
  }, []);

  const marineCoords = useMemo(() => {
    return toLatLng(defaultArea?.coordinates);
  }, [defaultArea]);

  const hazardsList = useMemo(() => {
    const list = Array.isArray(boundariesData) ? boundariesData : [];
    return list
      .map((boundary: any) => {
        const points = Array.isArray(boundary.polygon)
          ? boundary.polygon.map(toLatLng).filter((c: [number, number] | null): c is [number, number] => c !== null)
          : [];

        if (points.length === 0) return null;

        const center: [number, number] = [
          points.reduce((sum: number, p: [number, number]) => sum + p[0], 0) / points.length,
          points.reduce((sum: number, p: [number, number]) => sum + p[1], 0) / points.length,
        ];

        return {
          id: boundary.id,
          type: boundary.type,
          name: boundary.name,
          severity: boundary.restriction === "no_entry" ? "Critical" : "Elevated",
          description: boundary.description,
          latLng: center,
        };
      })
      .filter((h): h is NonNullable<typeof h> => h !== null);
  }, []);

  const fishingZonesList = useMemo(() => {
    const list = (fishingZonesData as any)?.zones || (fishingZonesData as any) || [];
    if (!Array.isArray(list)) return [];
    return list
      .map((zone: any) => {
        const rawCoords = zone.coordinates || zone.polygon || [];
        const validCoords = Array.isArray(rawCoords)
          ? rawCoords.map(toLatLng).filter((c): c is [number, number] => c !== null)
          : [];
        return { ...zone, parsedCoordinates: validCoords };
      })
      .filter((zone: any) => zone.parsedCoordinates.length >= 3);
  }, []);

  const alertsList = useMemo(() => {
    const list = (alertsData as any)?.alerts || (alertsData as any) || [];
    if (!Array.isArray(list)) return [];
    return list
      .map((a: any) => ({ ...a, latLng: toLatLng(a) }))
      .filter((a: any) => a.latLng !== null);
  }, []);

  const routesList = useMemo(() => {
    const list = (routesData as any)?.routes || (routesData as any) || [];
    if (!Array.isArray(list)) return [];
    return list
      .map((route: any) => {
        const rawWaypoints = route.waypoints || route.coordinates || route.path || [];
        const validWaypoints = Array.isArray(rawWaypoints)
          ? rawWaypoints.map(toLatLng).filter((c): c is [number, number] => c !== null)
          : [];

        const score = Number(route.risk?.score ?? route.riskScore) || 20;
        const decision = route.routeDecision || (score > 60 ? "avoid" : score > 30 ? "caution" : "preferred");

        return {
          ...route,
          calculatedScore: score,
          resolvedDecision: decision,
          parsedWaypoints: validWaypoints,
        };
      })
      .filter((route: any) => route.parsedWaypoints.length >= 2);
  }, []);

  const overrideRoutesList = useMemo(() => {
    if (!overrideRoutes) {
      return null;
    }

    return overrideRoutes
      .map((route) => ({
        ...route,
        calculatedScore: route.risk.score,
        resolvedDecision:
          route.routeDecision === "avoid" || route.routeDecision === "blocked"
            ? "avoid"
            : route.routeDecision === "caution"
              ? "caution"
              : "preferred",
        parsedWaypoints: route.waypoints
          .map((point) => toLatLng(point))
          .filter((c): c is [number, number] => c !== null),
      }))
      .filter((route) => route.parsedWaypoints.length >= 2);
  }, [overrideRoutes]);

  const activeRoutesList = overrideRoutesList ?? routesList;

  const routeBoundsPoints = useMemo<[number, number][]>(() => {
    if (!overrideRoutesList) {
      return [];
    }

    return overrideRoutesList.flatMap(
      (route) => route.parsedWaypoints
    );
  }, [overrideRoutesList]);

  const startMarkerPosition = useMemo(
    () => toLatLng(startPoint),
    [startPoint]
  );

  const endMarkerPosition = useMemo(
    () => toLatLng(endPoint),
    [endPoint]
  );

  const journeyMarkerPosition = useMemo(
    () => toLatLng(journeyPosition),
    [journeyPosition]
  );

  const highlightPosition = useMemo(
    () => toLatLng(highlight),
    [highlight]
  );

  const boatIcon = useMemo(
    () =>
      divIcon({
        className: "marine-map-boat-icon",
        html: `<div class="marine-map-boat-glyph" style="transform: rotate(${journeyBearingDeg}deg)"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    [journeyBearingDeg]
  );

  const handleLocationChange = useCallback(
    (nextLocation: Coordinates) => {
      setLocation(nextLocation);
      onLocationChange?.(nextLocation);
    },
    [onLocationChange]
  );

  const toggleLayer = useCallback((layer: MapLayerKey) => {
    setActiveLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  }, []);

  const handleZoomIn = () => {
    if (mapInstance && mapInstance.getContainer()) mapInstance.zoomIn();
  };

  const handleZoomOut = () => {
    if (mapInstance && mapInstance.getContainer()) mapInstance.zoomOut();
  };

  const handleLocate = () => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        handleLocationChange(coords);
        if (mapInstance && mapInstance.getContainer()) {
          mapInstance.flyTo([coords.latitude, coords.longitude], 12, { animate: true, duration: 0.6 });
        }
      },
      (err) => console.warn("Geolocation warning:", err.message),
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 5000 }
    );
  };

  const activeCount = useMemo(() => Object.values(activeLayers).filter(Boolean).length, [activeLayers]);

  return (
    <div className={`marine-map ${className}`.trim()}>
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        minZoom={APP_CONFIG.map.minZoom}
        maxZoom={APP_CONFIG.map.maxZoom}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        touchZoom={true}
        dragging={true}
        zoomControl={false}
        attributionControl={true}
        className="marine-map-canvas"
        ref={setMapInstance}
      >
        <TileLayer
          url={APP_CONFIG.map.tileUrl}
          attribution={APP_CONFIG.map.attribution}
          maxZoom={APP_CONFIG.map.maxZoom}
        />

        <MapSyncController center={mapCenter} zoom={zoom} />

        {routeBoundsPoints.length > 0 && (
          <RouteBoundsController points={routeBoundsPoints} />
        )}

        {/* 1. SEA CONDITIONS LAYER */}
        {activeLayers.conditions && marineCoords && (
          <CircleMarker
            center={marineCoords}
            radius={14}
            pathOptions={{
              color: "#2563EB",
              fillColor: "#3B82F6",
              fillOpacity: 0.35,
              weight: 2,
            }}
          >
            <Popup>
              <div className="marine-map-popup">
                <div className="marine-map-popup-title">{defaultArea?.name || "Marine Monitoring Station"}</div>
                <div>Sea State: <b>{defaultArea?.conditions?.seaState || "Moderate"}</b></div>
                <div>Wave Height: {defaultArea?.conditions?.waveHeightM ?? "1.2"} m</div>
                <div>Wind Speed: {defaultArea?.conditions?.windSpeedKnots ?? "14"} kts</div>
                <div>Surface Temp: {defaultArea?.marineIndicators?.seaSurfaceTemperatureC ?? "28.3"} °C</div>
              </div>
            </Popup>
          </CircleMarker>
        )}

        {/* 2. FISHING ZONES (PFZ) LAYER */}
        {activeLayers.pfz &&
          fishingZonesList.map((zone: any, idx: number) => {
            const isHigh = zone.suitability === "High";
            return (
              <Polygon
                key={zone.id || idx}
                positions={zone.parsedCoordinates}
                pathOptions={{
                  color: isHigh ? "#059669" : "#D97706",
                  fillColor: isHigh ? "#10B981" : "#FBBF24",
                  fillOpacity: 0.25,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="marine-map-popup">
                    <div className="marine-map-popup-title">{zone.name || "Potential Fishing Zone"}</div>
                    <div>Suitability: <b style={{ color: isHigh ? "#059669" : "#D97706" }}>{zone.suitability || "Moderate"}</b></div>
                    <div>Depth: {zone.depthMeters ? `${zone.depthMeters} m` : "40 m"}</div>
                    <div>Chlorophyll: {zone.chlorophyll ?? "N/A"} mg/m³</div>
                    <div>SST: {zone.sst ?? "N/A"} °C</div>
                    {zone.fishSpecies && Array.isArray(zone.fishSpecies) && (
                      <div>Target: <i>{zone.fishSpecies.join(", ")}</i></div>
                    )}
                  </div>
                </Popup>
              </Polygon>
            );
          })}

        {/* 3. HAZARDS LAYER */}
        {activeLayers.hazards &&
          hazardsList.map((hazard: any, idx: number) => (
            <CircleMarker
              key={hazard.id || idx}
              center={hazard.latLng}
              radius={8}
              pathOptions={{
                color: "#DC2626",
                fillColor: "#EF4444",
                fillOpacity: 0.85,
                weight: 2,
              }}
            >
              <Popup>
                <div className="marine-map-popup">
                  <div className="marine-map-popup-title">{hazard.type || hazard.name || "Marine Hazard"}</div>
                  <div>Severity: <span className="marine-map-danger">{hazard.severity || "Elevated"}</span></div>
                  <div>{hazard.description || hazard.message || "Active maritime navigational alert."}</div>
                </div>
              </Popup>
            </CircleMarker>
          ))}

        {/* 4. WEATHER ALERTS LAYER */}
        {activeLayers.weather &&
          alertsList.map((alert: any, idx: number) => (
            <CircleMarker
              key={alert.id || idx}
              center={alert.latLng}
              radius={13}
              pathOptions={{
                color: "#D97706",
                fillColor: "#F59E0B",
                fillOpacity: 0.55,
                dashArray: "4, 6",
                weight: 2,
              }}
            >
              <Popup>
                <div className="marine-map-popup">
                  <div className="marine-map-popup-title">{alert.title || "Marine Advisory"}</div>
                  <div>Severity: <b>{alert.severity || "Moderate"}</b></div>
                  <div>{alert.message || alert.description || "Advisory in effect for this coastal sector."}</div>
                </div>
              </Popup>
            </CircleMarker>
          ))}

        {/* 5. ROUTES LAYER */}
        {activeLayers.routes &&
          activeRoutesList.map((route: any, idx: number) => {
            const isAvoid = route.resolvedDecision === "avoid" || route.resolvedDecision === "blocked";
            const isCaution = route.resolvedDecision === "caution";
            const routeColor = isAvoid ? "#DC2626" : isCaution ? "#D97706" : "#16A34A";

            const isControlled = Boolean(overrideRoutesList);
            const isSelected = !isControlled || route.id === selectedRouteId;

            return (
              <Polyline
                key={route.id || idx}
                positions={route.parsedWaypoints}
                pathOptions={{
                  color: routeColor,
                  weight: isSelected ? 5 : 3,
                  opacity: isSelected ? 0.95 : 0.45,
                  dashArray: isAvoid ? "6, 8" : undefined,
                }}
                eventHandlers={
                  onSelectRoute
                    ? { click: () => onSelectRoute(route.id) }
                    : undefined
                }
              >
                <Popup>
                  <div className="marine-map-popup">
                    <div className="marine-map-popup-title">{route.name || "Route Corridor"}</div>
                    <div>
                      Status:{" "}
                      <b style={{ color: routeColor, textTransform: "capitalize" }}>
                        {route.resolvedDecision}
                      </b>
                    </div>
                    <div>Risk Score: <b>{route.calculatedScore}/100</b></div>
                    <div>Distance: {route.distanceKm ?? "N/A"} km</div>
                    <div>Est. Time: {route.estimatedDurationHours ?? "N/A"} hrs</div>
                    {route.conditions?.wind && <div>Wind: {route.conditions.wind}</div>}
                    {route.reason && (
                      <div style={{ marginTop: "4px", fontSize: "11px", color: "#475569" }}>
                        {route.reason}
                      </div>
                    )}
                  </div>
                </Popup>
              </Polyline>
            );
          })}

        {/* ROUTE PLANNER START / DESTINATION MARKERS */}
        {startMarkerPosition && (
          <CircleMarker
            center={startMarkerPosition}
            radius={8}
            pathOptions={{ color: "#FFFFFF", fillColor: "#6D28D9", fillOpacity: 1, weight: 3 }}
          >
            <Popup>Departure point</Popup>
          </CircleMarker>
        )}

        {endMarkerPosition && (
          <CircleMarker
            center={endMarkerPosition}
            radius={8}
            pathOptions={{ color: "#FFFFFF", fillColor: "#15803D", fillOpacity: 1, weight: 3 }}
          >
            <Popup>Destination</Popup>
          </CircleMarker>
        )}

        {/* JOURNEY SIMULATION MARKER (demo only, not live vessel tracking) */}
        {journeyMarkerPosition && (
          <Marker position={journeyMarkerPosition} icon={boatIcon}>
            <Popup>Route simulation (demo)</Popup>
          </Marker>
        )}

        {/* CHAT -> MAP HANDOFF HIGHLIGHT */}
        {highlightPosition && (
          <>
            <CircleMarker
              center={highlightPosition}
              radius={22}
              pathOptions={{
                color: "#EA580C",
                fillColor: "#EA580C",
                fillOpacity: 0.1,
                weight: 2,
                dashArray: "3, 5",
              }}
            />
            <CircleMarker
              center={highlightPosition}
              radius={9}
              pathOptions={{
                color: "#FFFFFF",
                fillColor: "#EA580C",
                fillOpacity: 1,
                weight: 3,
              }}
            >
              {highlight?.label && <Popup>{highlight.label}</Popup>}
            </CircleMarker>
          </>
        )}

        {/* USER POSITION */}
        {location && (
          <>
            <CircleMarker
              center={[location.latitude, location.longitude]}
              radius={7}
              pathOptions={{ color: "#FFFFFF", fillColor: "#6D28D9", fillOpacity: 1, weight: 3 }}
            />
            <CircleMarker
              center={[location.latitude, location.longitude]}
              radius={18}
              pathOptions={{ color: "#6D28D9", fillColor: "#6D28D9", fillOpacity: 0.12, weight: 1 }}
            />
          </>
        )}
      </MapContainer>

      {/* Control Overlay */}
      <div className="marine-map-overlay">
        <div className="marine-map-topbar">
          <div className="marine-map-status">
            <span className="marine-map-status-dot" />
            <span>MARINE MAP</span>
          </div>

          <button
            type="button"
            className="marine-map-layer-button"
            onClick={() => setLayersOpen((open) => !open)}
            aria-expanded={layersOpen}
          >
            Layers ({activeCount})
          </button>
        </div>

        {layersOpen && (
          <div className="marine-map-layer-panel">
            <MapLayers activeLayers={activeLayers} onToggle={toggleLayer} />
          </div>
        )}

        <MapControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onLocate={handleLocate}
          onLayers={() => setLayersOpen((open) => !open)}
        />

        {!location ? (
          <div className="marine-map-location-status">
            <span>Tap locate to show position</span>
          </div>
        ) : (
          <div className="marine-map-location-status marine-map-location-live">
            <span className="marine-map-location-dot" />
            <span>Location active</span>
          </div>
        )}
      </div>
    </div>
  );
}