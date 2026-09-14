import type { DataDomain } from "./dataDiscovery";

export type SourceKind =
  | "local"
  | "api"
  | "satellite"
  | "meteorological"
  | "geospatial";

export type SourceStatus =
  | "available"
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

    status: "planned",

    description:
      "External marine and ocean-information source reserved for a future live adapter.",

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

    status: "planned",

    description:
      "External meteorological source reserved for a future live weather adapter.",

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
    id: "isro",
    name: "ISRO",
    provider: "Indian Space Research Organisation",

    domain: "ocean",
    kind: "satellite",

    status: "planned",

    description:
      "External satellite-data source reserved for a future satellite-data adapter.",

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