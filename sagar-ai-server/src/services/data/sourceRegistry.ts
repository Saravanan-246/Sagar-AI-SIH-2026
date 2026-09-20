import type { DataDomain } from "./dataDiscovery";

export type SourceKind =
  | "local"
  | "api"
  | "satellite"
  | "meteorological"
  | "geospatial";

export type SourceStatus =
  | "available"
  | "connected"
  | "requires_credentials"
  | "planned"
  | "unavailable";

export interface DataSource {
  id: string;
  name: string;
  provider: string;

  domain: DataDomain;
  kind: SourceKind;

  status: SourceStatus;

  description: string;

  supports: string[];

  local: boolean;

  endpoint?: string;

  updateFrequency?: string;

  metadata?: Record<string, unknown>;
}

const SOURCES: DataSource[] = [
  {
    id: "local-marine",
    name: "Marine Observation Dataset",
    provider: "Sagar AI Local Dataset",

    domain: "marine",
    kind: "local",

    status: "available",

    description:
      "Configured marine observations including wind, waves, visibility, tide, hazards and safety conditions.",

    supports: [
      "marine conditions",
      "wind",
      "waves",
      "visibility",
      "tide",
      "hazards",
      "safety",
    ],

    local: true,

    updateFrequency:
      "Prototype dataset",
  },

  {
    id: "local-weather",
    name: "Marine Weather Dataset",
    provider: "Sagar AI Local Dataset",

    domain: "weather",
    kind: "meteorological",

    status: "available",

    description:
      "Configured weather and marine hazard information used for operational assessment.",

    supports: [
      "weather",
      "lightning",
      "cyclone",
      "strong wind",
      "rough sea",
      "high waves",
    ],

    local: true,

    updateFrequency:
      "Prototype dataset",
  },

  {
    id: "local-ocean",
    name: "Ocean Productivity Dataset",
    provider: "Sagar AI Local Dataset",

    domain: "ocean",
    kind: "satellite",

    status: "available",

    description:
      "Configured ocean indicators including sea-surface temperature, chlorophyll and productivity trends.",

    supports: [
      "SST",
      "sea surface temperature",
      "chlorophyll",
      "productivity",
      "fishing zones",
      "productivity trend",
    ],

    local: true,

    updateFrequency:
      "Prototype dataset",
  },

  {
    id: "local-boundaries",
    name: "Geospatial Boundary Dataset",
    provider: "Sagar AI Local Dataset",

    domain: "geospatial",
    kind: "geospatial",

    status: "available",

    description:
      "Configured operational, protected, restricted and conservation boundaries.",

    supports: [
      "geofence",
      "restricted areas",
      "protected areas",
      "conservation zones",
      "navigation corridors",
      "boundary proximity",
    ],

    local: true,

    updateFrequency:
      "Prototype dataset",
  },

  {
    id: "local-alerts",
    name: "Marine Alert Dataset",
    provider: "Sagar AI Local Dataset",

    domain: "alerts",
    kind: "meteorological",

    status: "available",

    description:
      "Configured marine alerts covering adverse weather and operational hazards.",

    supports: [
      "alerts",
      "lightning",
      "cyclone",
      "rough sea",
      "strong wind",
      "visibility",
    ],

    local: true,

    updateFrequency:
      "Prototype dataset",
  },

  {
    id: "local-routes",
    name: "Route Planning Dataset",
    provider: "Sagar AI Local Dataset",

    domain: "route",
    kind: "geospatial",

    status: "available",

    description:
      "Configured operational routes with distance, duration, risk and restriction context.",

    supports: [
      "route",
      "navigation",
      "distance",
      "ETA",
      "route risk",
      "alternative route",
    ],

    local: true,

    updateFrequency:
      "Prototype dataset",
  },

  {
    id: "local-scenarios",
    name: "Scenario Dataset",
    provider: "Sagar AI Local Dataset",

    domain: "scenario",
    kind: "local",

    status: "available",

    description:
      "Configured what-if scenarios for marine operational planning.",

    supports: [
      "scenario",
      "what-if",
      "operational planning",
      "departure planning",
      "route change",
    ],

    local: true,

    updateFrequency:
      "Prototype dataset",
  },

  /*
   * External source slots are intentionally
   * registered separately from local data.
   * They can later be connected through adapters.
   */
  {
    id: "incois",
    name: "INCOIS",
    provider: "Indian National Centre for Ocean Information Services",

    domain: "marine",
    kind: "api",

    status: "connected",

    description:
      "Connected: INCOIS's public ERDDAP ocean server (ARGO-based sea-surface temperature analysis), queried live with no API key. Its own analysis timestamp is reported honestly and can lag well behind the dataset's intended cadence (re-verified: ~7 weeks old as of this check, not the ~10 days its name implies), so freshness is computed from the real observed time, never assumed. Coverage is regional open-ocean only (no shallow coastal Gulf of Mannar/Palk Bay data), so readings are shown as supplementary regional context - never substituted for a coastal area's own local reading, never rendered as a map layer, and never fed into risk/route/zone scoring.",

    supports: [
      "ocean information",
      "marine observations",
      "ocean advisories",
      "fishing advisories",
    ],

    local: false,
  },

  {
    id: "imd",
    name: "IMD",
    provider: "India Meteorological Department",

    domain: "weather",
    kind: "meteorological",

    status: "requires_credentials",

    description:
      "Not connected - IMD's official weather API requires a registered API key Sagar does not currently hold. Sagar continues using its configured prototype weather dataset.",

    supports: [
      "weather",
      "cyclone",
      "wind",
      "rain",
      "warnings",
    ],

    local: false,
  },

  {
    id: "open-meteo-marine",
    name: "Open-Meteo Marine + Weather Forecast API",
    provider: "Open-Meteo (open-meteo.com)",

    domain: "marine",
    kind: "api",

    status: "connected",

    description:
      "Connected: Open-Meteo's free, no-API-key Marine Weather API (wave/current/SST/sea-level) and Weather Forecast API (wind), queried live over a bounded Gulf of Mannar pilot grid. These are forecast/model outputs (Open-Meteo's own wave/ocean/atmospheric model blend), never local sensor observations or AIS - always presented as \"Marine Model\"/\"Model Conditions\", never as live/observed readings. Used only for the map's optional Wind/Waves/Current/SST/Tide layers - never fed into risk, PFZ or route scoring.",

    supports: [
      "wave height",
      "swell",
      "ocean current",
      "sea surface temperature",
      "sea level",
      "tide",
      "wind",
      "marine model",
    ],

    local: false,

    updateFrequency: "Hourly-ish model refresh; Sagar caches responses for ~30 minutes",
  },

  {
    id: "isro",
    name: "ISRO",
    provider: "Indian Space Research Organisation",

    domain: "ocean",
    kind: "satellite",

    status: "planned",

    description:
      "Not connected - MOSDAC's satellite ocean/coastal products require portal registration and manual data access that has not been integrated. No viable automated access path identified yet.",

    supports: [
      "satellite",
      "remote sensing",
      "ocean observations",
      "coastal observations",
    ],

    local: false,
  },
];

export function getAllSources(): DataSource[] {
  return [...SOURCES];
}

export function getAvailableSources(): DataSource[] {
  return SOURCES.filter(
    (source) =>
      source.status === "available"
  );
}

export function getSourceById(
  id: string
): DataSource | undefined {
  return SOURCES.find(
    (source) =>
      source.id === id
  );
}

export function getSourcesByDomain(
  domain: DataDomain
): DataSource[] {
  return SOURCES.filter(
    (source) =>
      source.domain === domain
  );
}

export function getSourcesByKind(
  kind: SourceKind
): DataSource[] {
  return SOURCES.filter(
    (source) =>
      source.kind === kind
  );
}

export function getSourceStatus(
  id: string
): SourceStatus | undefined {
  return getSourceById(id)?.status;
}

export function isSourceAvailable(
  id: string
): boolean {
  return (
    getSourceById(id)?.status ===
    "available"
  );
}

export function searchSources(
  query: string
): DataSource[] {
  const normalized =
    query.trim().toLowerCase();

  if (!normalized) {
    return getAllSources();
  }

  return SOURCES.filter(
    (source) => {
      const searchable = [
        source.id,
        source.name,
        source.provider,
        source.domain,
        source.description,
        ...source.supports,
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(
        normalized
      );
    }
  );
}

export default SOURCES;