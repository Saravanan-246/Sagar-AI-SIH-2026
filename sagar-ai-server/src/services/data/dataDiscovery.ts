import type { AgentRequest } from "../agents/agentTypes";

export type DataDomain =
  | "marine"
  | "weather"
  | "ocean"
  | "geospatial"
  | "alerts"
  | "route"
  | "scenario";

export interface DataSourceDescriptor {
  id: string;
  name: string;
  domain: DataDomain;
  description: string;
  priority: number;
  local: boolean;
  available: boolean;
  supports: string[];
}

export interface DiscoveryResult {
  query: string;
  intent: string;
  sources: DataSourceDescriptor[];
  domains: DataDomain[];
  reasoning: string;
}

const SOURCE_CATALOGUE: DataSourceDescriptor[] = [
  {
    id: "local-marine",
    name: "Marine Observation Dataset",
    domain: "marine",
    description:
      "Configured marine conditions, tide, hazards and ocean indicators.",
    priority: 1,
    local: true,
    available: true,
    supports: [
      "marine conditions",
      "wind",
      "waves",
      "visibility",
      "tide",
      "hazards",
    ],
  },
  {
    id: "local-weather",
    name: "Marine Weather Dataset",
    domain: "weather",
    description:
      "Configured weather-related hazards and marine conditions.",
    priority: 1,
    local: true,
    available: true,
    supports: [
      "weather",
      "lightning",
      "cyclone",
      "strong wind",
      "rough sea",
    ],
  },
  {
    id: "local-ocean",
    name: "Ocean Productivity Dataset",
    domain: "ocean",
    description:
      "Configured SST, chlorophyll, productivity trends and drivers.",
    priority: 1,
    local: true,
    available: true,
    supports: [
      "productivity",
      "chlorophyll",
      "SST",
      "fishing zones",
    ],
  },
  {
    id: "local-boundaries",
    name: "Geospatial Boundary Dataset",
    domain: "geospatial",
    description:
      "Configured protected, restricted and operational boundaries.",
    priority: 1,
    local: true,
    available: true,
    supports: [
      "geofence",
      "restricted areas",
      "protected areas",
      "navigation corridors",
    ],
  },
  {
    id: "local-alerts",
    name: "Marine Alert Dataset",
    domain: "alerts",
    description:
      "Configured active and upcoming marine hazard alerts.",
    priority: 1,
    local: true,
    available: true,
    supports: [
      "alerts",
      "lightning",
      "cyclone",
      "waves",
      "wind",
    ],
  },
  {
    id: "local-routes",
    name: "Route Dataset",
    domain: "route",
    description:
      "Configured operational routes and route-risk information.",
    priority: 1,
    local: true,
    available: true,
    supports: [
      "route",
      "navigation",
      "distance",
      "ETA",
      "route risk",
    ],
  },
  {
    id: "local-scenarios",
    name: "Scenario Dataset",
    domain: "scenario",
    description:
      "Configured scenario definitions for operational what-if analysis.",
    priority: 1,
    local: true,
    available: true,
    supports: [
      "scenario",
      "what-if",
      "forecast",
      "operational planning",
    ],
  },
];

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase();
}

function containsAny(
  text: string,
  keywords: string[]
): boolean {
  return keywords.some(
    (keyword) =>
      text.includes(normalize(keyword))
  );
}

function domainsForIntent(
  intent: string
): DataDomain[] {
  switch (intent) {
    case "marine_conditions":
      return ["marine", "weather"];

    case "safety":
      return [
        "marine",
        "weather",
        "geospatial",
        "alerts",
      ];

    case "alerts":
      return [
        "alerts",
        "weather",
        "marine",
        "geospatial",
      ];

    case "pfz":
      return [
        "ocean",
        "marine",
        "weather",
        "geospatial",
      ];

    case "productivity":
      return [
        "ocean",
        "marine",
        "weather",
      ];

    case "route":
      return [
        "route",
        "marine",
        "weather",
        "geospatial",
      ];

    case "geofence":
      return [
        "geospatial",
        "marine",
        "alerts",
      ];

    case "tide":
      return ["marine"];

    default:
      return [
        "marine",
        "weather",
        "ocean",
        "geospatial",
      ];
  }
}

function discoverByQuery(
  request: AgentRequest
): DataSourceDescriptor[] {
  const text =
    normalize(request.message);

  return SOURCE_CATALOGUE.filter(
    (source) => {
      if (
        containsAny(
          text,
          source.supports
        )
      ) {
        return true;
      }

      return source.name
        .toLowerCase()
        .includes(text);
    }
  );
}

function discoverByDomains(
  domains: DataDomain[]
): DataSourceDescriptor[] {
  return SOURCE_CATALOGUE.filter(
    (source) =>
      domains.includes(
        source.domain
      )
  );
}

export function discoverDataSources(
  request: AgentRequest
): DiscoveryResult {
  const domains =
    domainsForIntent(
      request.intent
    );

  const queryMatches =
    discoverByQuery(request);

  const domainMatches =
    discoverByDomains(domains);

  const merged = new Map<
    string,
    DataSourceDescriptor
  >();

  for (const source of domainMatches) {
    merged.set(
      source.id,
      source
    );
  }

  for (const source of queryMatches) {
    merged.set(
      source.id,
      source
    );
  }

  const sources =
    Array.from(
      merged.values()
    )
      .filter(
        (source) =>
          source.available
      )
      .sort(
        (a, b) =>
          a.priority -
          b.priority
      );

  return {
    query: request.message,
    intent: request.intent,
    sources,
    domains,

    reasoning:
      `Selected ${sources.length} configured source(s) across ${domains.length} domain(s) for the ${request.intent.replace(
        /_/g,
        " "
      )} request.`,
  };
}

export function getDataSource(
  id: string
): DataSourceDescriptor | undefined {
  return SOURCE_CATALOGUE.find(
    (source) =>
      source.id === id
  );
}

export function getDataSourcesByDomain(
  domain: DataDomain
): DataSourceDescriptor[] {
  return SOURCE_CATALOGUE.filter(
    (source) =>
      source.domain === domain
  );
}

export function getAvailableDataSources(): DataSourceDescriptor[] {
  return SOURCE_CATALOGUE.filter(
    (source) =>
      source.available
  );
}

export function getAllDataSources(): DataSourceDescriptor[] {
  return [...SOURCE_CATALOGUE];
}

export default discoverDataSources;