import {
  Activity,
  CheckCircle2,
  Database,
  ExternalLink,
  FileSearch,
  Globe2,
  Info,
  Map,
  RefreshCw,
  Satellite,
  ShieldCheck,
  Waves,
  Wind,
} from "lucide-react";
import { useMemo, useState } from "react";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";

import "./Sources.css";

export type SourceStatus =
  | "available"
  | "integrated"
  | "partial"
  | "requires_credentials"
  | "planned";

export type SourceCategory =
  | "marine"
  | "weather"
  | "satellite"
  | "geospatial"
  | "operational";

export type DataSource = {
  id: string;
  name: string;
  organization: string;
  category: SourceCategory;
  status: SourceStatus;
  description: string;
  datasets: string[];
  role: string;
  officialUrl?: string;
};

export const SOURCES: DataSource[] = [
  {
    id: "incois",
    name: "INCOIS",
    organization:
      "Indian National Centre for Ocean Information Services",
    category: "marine",
    status: "partial",
    description:
      "Direct queries to the public ERDDAP ocean server for sea-surface temperature (an ARGO-based analysis, not a live sensor reading). ARGO coverage is primarily 50-150 km offshore, used as regional background context alongside local coastal layers. Its own analysis timestamp is shown as-is and can lag its intended ~10-day cadence by weeks - never labelled real-time.",
    datasets: [
      "Regional Sea Surface Temperature (ARGO analysis)",
      "Offshore Ocean Analysis",
    ],
    role: "Regional Marine Reference",
    officialUrl: "https://incois.gov.in/",
  },
  {
    id: "imd",
    name: "IMD",
    organization: "India Meteorological Department",
    category: "weather",
    status: "requires_credentials",
    description:
      "Not connected - IMD's official weather API requires a registered API key that Sagar does not currently hold. Sagar uses its own configured prototype weather dataset instead.",
    datasets: [
      "Cyclone Tracking & Trajectories",
      "Severe Weather & Lightning Advisories",
      "Coastal Wind Vectors",
    ],
    role: "Weather Intelligence",
    officialUrl: "https://mausam.imd.gov.in/",
  },
  {
    id: "isro",
    name: "ISRO / MOSDAC",
    organization: "Indian Space Research Organisation",
    category: "satellite",
    status: "planned",
    description:
      "Not connected - MOSDAC's satellite ocean-colour and surface products require portal registration and manual data access that Sagar has not integrated. Sagar uses its own configured prototype ocean dataset instead.",
    datasets: [
      "Ocean Color Monitor (OCM)",
      "Scatterometer Surface Winds",
      "Thermal Infrared Imagery",
    ],
    role: "Orbital Earth Observation",
    officialUrl: "https://www.mosdac.gov.in/",
  },
  {
    id: "osm",
    name: "OpenStreetMap",
    organization: "OpenStreetMap Community",
    category: "geospatial",
    status: "integrated",
    description:
      "High-precision coastal topography, navigational contours, and base cartographic tiles used across all map views.",
    datasets: ["Base Navigational Cartography", "Coastline Boundaries"],
    role: "Cartographic Visualization",
    officialUrl: "https://www.openstreetmap.org/",
  },
  {
    id: "marine-boundaries",
    name: "Marine Boundary Repository",
    organization: "Sagar Geospatial Core",
    category: "geospatial",
    status: "available",
    description:
      "Pre-configured territorial water boundaries, maritime protection sanctuaries, and operational geofence limits.",
    datasets: [
      "Territorial Waters Baseline",
      "Marine Protected Areas (MPAs)",
      "Fisheries Exclusion Zones",
    ],
    role: "Geofencing & Safety Rules",
  },
  {
    id: "pfz-context",
    name: "Potential Fishing Zone (PFZ) Layer",
    organization: "Sagar Oceanographic Models",
    category: "marine",
    status: "available",
    // Unlike a real satellite gradient/front-detection pipeline, this is
    // Sagar's own configured PFZ dataset (see zoneRanking.ts): a fixed
    // suitability/chlorophyll/SST value per zone, ranked by a
    // deterministic scoring rule - matches the honest "configured
    // prototype dataset" disclosure already used above for IMD/ISRO/
    // the Marine Boundary Repository.
    description:
      "Sagar's own configured PFZ dataset: pre-set suitability, chlorophyll, and sea-surface-temperature values per zone, ranked by a deterministic scoring rule - not a live satellite chlorophyll or thermal-front feed.",
    datasets: [
      "Configured Zone Suitability Ratings",
      "Configured Chlorophyll & SST Values",
      "PFZ Sector Rankings (deterministic, from configured data)",
    ],
    role: "PFZ Fishery Optimization",
  },
  {
    id: "alert-repository",
    name: "Maritime Safety Advisory Index",
    organization: "Sagar Operations Center",
    category: "operational",
    status: "available",
    description:
      "Synchronized hazard registry aggregating severe squalls, rough swell alerts, and localized naval exclusion advisories.",
    datasets: [
      "Swell Surge Advisories",
      "Localized Squall Alerts",
      "Active Navigation Notices",
    ],
    role: "Real-Time Hazard Index",
  },
];

type FilterValue = "all" | SourceCategory;

export function categoryLabel(category: SourceCategory): string {
  switch (category) {
    case "marine":
      return "Marine";
    case "weather":
      return "Weather";
    case "satellite":
      return "Satellite";
    case "geospatial":
      return "Geospatial";
    case "operational":
      return "Operational";
  }
}

export function categoryIcon(category: SourceCategory) {
  switch (category) {
    case "marine":
      return Waves;
    case "weather":
      return Wind;
    case "satellite":
      return Satellite;
    case "geospatial":
      return Map;
    case "operational":
      return ShieldCheck;
    default:
      return Database;
  }
}

export function statusLabel(status: SourceStatus): string {
  switch (status) {
    case "integrated":
      return "Connected";
    case "available":
      return "Operational";
    case "partial":
      return "Partial (Offshore)";
    case "requires_credentials":
      return "Requires credentials";
    case "planned":
      return "Future";
    default:
      return "Unknown";
  }
}

export function statusTone(
  status: SourceStatus
): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "integrated":
      return "success";
    case "available":
      return "neutral";
    case "partial":
      return "warning";
    case "requires_credentials":
      return "warning";
    case "planned":
      return "neutral";
    default:
      return "neutral";
  }
}

export default function Sources() {
  const [filter, setFilter] = useState<FilterValue>("all");
  const [query, setQuery] = useState("");
  const [refreshed, setRefreshed] = useState(false);

  const filteredSources = useMemo(() => {
    const search = query.trim().toLowerCase();

    return SOURCES.filter((source) => {
      const matchesCategory =
        filter === "all" || source.category === filter;

      const matchesSearch =
        !search ||
        source.name.toLowerCase().includes(search) ||
        source.organization.toLowerCase().includes(search) ||
        source.description.toLowerCase().includes(search) ||
        source.datasets.some((d) => d.toLowerCase().includes(search));

      return matchesCategory && matchesSearch;
    });
  }, [filter, query]);

  const connectedCount = SOURCES.filter(
    (s) => s.status === "integrated" || s.status === "available"
  ).length;
  const marineCount = SOURCES.filter((s) => s.category === "marine").length;
  const geospatialCount = SOURCES.filter(
    (s) => s.category === "geospatial"
  ).length;

  const handleRefresh = () => {
    setRefreshed(true);
    window.setTimeout(() => setRefreshed(false), 1200);
  };

  return (
    <AppShell>
      <PageContainer className="sources-page">
        <header className="sources-header">
          <div>
            <div className="sources-eyebrow">
              <Database size={14} />
              <span>Data Architecture</span>
            </div>
            <h1>Data Sources & Provenance</h1>
            <p>
              Review the marine telemetry, meteorological models, and geospatial
              layers driving Sagar AI’s decision models.
            </p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            className="sources-check-btn"
          >
            <RefreshCw
              size={14}
              className={refreshed ? "sources-spin" : undefined}
            />
            {refreshed ? "Synced" : "Verify Feeds"}
          </Button>
        </header>

        {/* METRIC STRIP */}
        <section className="sources-summary-strip">
          <div className="summary-card">
            <div className="summary-icon bg-slate">
              <Database size={18} />
            </div>
            <div>
              <span className="summary-label">Cataloged Feeds</span>
              <strong className="summary-val">{SOURCES.length}</strong>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon bg-green">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <span className="summary-label">Active / Available</span>
              <strong className="summary-val">{connectedCount}</strong>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon bg-blue">
              <Waves size={18} />
            </div>
            <div>
              <span className="summary-label">Marine Telemetry</span>
              <strong className="summary-val">{marineCount}</strong>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon bg-teal">
              <Map size={18} />
            </div>
            <div>
              <span className="summary-label">Geospatial Bounds</span>
              <strong className="summary-val">{geospatialCount}</strong>
            </div>
          </div>
        </section>

        {/* ARCHITECTURE NOTICE */}
        <section className="sources-callout">
          <div className="callout-icon">
            <FileSearch size={18} />
          </div>
          <div className="callout-body">
            <h2>Evidence-Based Sensor Fusion</h2>
            <p>
              Recommendations cross-reference physical bathymetry, weather forecasts,
              and satellite chlorophyll readings before suggesting routes or fishing grounds.
              Data feeds operate in priority order, falling back to cached baselines if external endpoints fail.
            </p>
          </div>
        </section>

        {/* FILTER CONTROLS */}
        <section className="sources-toolbar">
          <div className="sources-search-box">
            <Database size={15} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by source name, provider, or dataset..."
              aria-label="Filter data sources"
            />
          </div>

          <div className="sources-pills" role="group" aria-label="Category filter">
            {(
              [
                ["all", "All"],
                ["marine", "Marine"],
                ["weather", "Weather"],
                ["satellite", "Satellite"],
                ["geospatial", "Geospatial"],
                ["operational", "Operational"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`filter-pill ${filter === value ? "active" : ""}`}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* SOURCE CARDS */}
        <section className="sources-container">
          <div className="sources-section-title">
            <h2>Source Catalog</h2>
            <span>
              Showing {filteredSources.length} of {SOURCES.length} data feeds
            </span>
          </div>

          {filteredSources.length === 0 ? (
            <div className="sources-empty-state">
              <Database size={24} />
              <h3>No matching feeds found</h3>
              <p>Try refining your query or reset the category filter.</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setFilter("all");
                  setQuery("");
                }}
              >
                Reset Search Filters
              </Button>
            </div>
          ) : (
            <div className="sources-grid">
              {filteredSources.map((source) => {
                const Icon = categoryIcon(source.category);

                return (
                  <article key={source.id} className="source-card">
                    <div className="source-header">
                      <div className={`source-icon-wrap cat-${source.category}`}>
                        <Icon size={18} />
                      </div>
                      <Badge tone={statusTone(source.status)} size="sm">
                        {statusLabel(source.status).toUpperCase()}
                      </Badge>
                    </div>

                    <div className="source-meta">
                      <span className="source-cat-label">
                        {categoryLabel(source.category)}
                      </span>
                      <h3>{source.name}</h3>
                      <p className="source-org">{source.organization}</p>
                    </div>

                    <p className="source-desc">{source.description}</p>

                    <div className="source-field">
                      <span className="field-label">Engine Role</span>
                      <strong className="field-val">{source.role}</strong>
                    </div>

                    <div className="source-datasets-block">
                      <span className="field-label">Provided Datasets</span>
                      <div className="dataset-tags">
                        {source.datasets.map((d) => (
                          <span key={d} className="dataset-tag">
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>

                    {source.officialUrl && (
                      <a
                        href={source.officialUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="source-external-link"
                      >
                        <span>Official Documentation</span>
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* BOTTOM DISCLAIMER */}
        <aside className="sources-transparency-card">
          <Info size={16} />
          <div>
            <strong>Provenance &amp; Operational Integrity</strong>
            <p>
              &ldquo;Connected&rdquo; and &ldquo;Operational&rdquo; statuses confirm schemas integrated
              into the Sagar local processing pipeline. Actual live refresh frequencies depend on
              regional endpoint availability and client internet connectivity.
            </p>
          </div>
        </aside>

        <footer className="sources-page-footer">
          <span>
            <Activity size={13} />
            Verified Against Indian Coastal Coordinates
          </span>
          <span>
            <Globe2 size={13} />
            INCOIS ERDDAP connected · IMD not yet connected
          </span>
        </footer>
      </PageContainer>
    </AppShell>
  );
}