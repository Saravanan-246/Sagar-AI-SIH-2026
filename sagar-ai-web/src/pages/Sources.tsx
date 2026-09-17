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

type SourceStatus =
  | "available"
  | "integrated"
  /** A real, verified connection exists and returns genuine data, but
   * with real limitations (e.g. no coverage for Sagar's coastal areas,
   * or data that lags real time by weeks) - shown as supplementary
   * context, never as a source the core risk/route/zone decisions
   * depend on. Distinct from "integrated" so it isn't overstated. */
  | "partial"
  | "planned";

type SourceCategory =
  | "marine"
  | "weather"
  | "satellite"
  | "geospatial"
  | "operational";

type DataSource = {
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

const SOURCES: DataSource[] = [
  {
    id: "incois",
    name: "INCOIS",
    organization:
      "Indian National Centre for Ocean Information Services",
    category: "marine",
    status: "partial",
    description:
      "Sagar queries INCOIS's public ERDDAP ocean-data server directly for a real sea-surface-temperature reading. Its ARGO-based analysis has no coverage in Sagar's shallow coastal operating areas, so the nearest valid reading is typically 50-150+ km offshore and used only as regional context, shown alongside - never in place of - Sagar's own local marine dataset.",
    datasets: [
      "Regional sea-surface temperature (ARGO ocean analysis)",
    ],
    role: "Supplementary ocean reference",
    officialUrl:
      "https://incois.gov.in/",
  },
  {
    id: "imd",
    name: "IMD",
    organization:
      "India Meteorological Department",
    category: "weather",
    status: "planned",
    description:
      "IMD publishes a real weather/marine-warnings API (api.imd.gov.in), but it requires a registered API key Sagar does not currently have - direct requests return \"API key missing\". Not connected; Sagar continues using its own configured weather dataset.",
    datasets: [
      "Weather forecasts",
      "Cyclone information",
      "Lightning and severe weather",
      "Wind information",
    ],
    role: "Weather intelligence (not yet connected)",
    officialUrl:
      "https://mausam.imd.gov.in/",
  },
  {
    id: "isro",
    name: "ISRO / MOSDAC",
    organization:
      "Indian Space Research Organisation",
    category: "satellite",
    status: "planned",
    description:
      "ISRO's MOSDAC portal offers real open ocean/atmosphere satellite products, but delivery is via a registered portal account and SFTP, not a public API - not something Sagar can safely automate without credentials. Not connected.",
    datasets: [
      "Satellite observations",
      "Ocean colour context",
      "Sea-surface observations",
      "Geospatial imagery",
    ],
    role: "Satellite intelligence (not yet connected)",
    officialUrl:
      "https://www.mosdac.gov.in/",
  },
  {
    id: "osm",
    name: "OpenStreetMap",
    organization:
      "OpenStreetMap community",
    category: "geospatial",
    status: "integrated",
    description:
      "Base geographic mapping used to provide the interactive spatial context for Sagar.",
    datasets: [
      "Base map",
      "Coastal geography",
      "Geographic reference",
    ],
    role: "Map visualization",
    officialUrl:
      "https://www.openstreetmap.org/",
  },
  {
    id: "marine-boundaries",
    name: "Marine Boundary Repository",
    organization:
      "Sagar geospatial layer",
    category: "geospatial",
    status: "available",
    description:
      "Configured marine boundaries used to reason about restricted, protected and operationally excluded areas.",
    datasets: [
      "Restricted waters",
      "Protected sectors",
      "Conservation areas",
      "Operational exclusion zones",
    ],
    role: "Geofencing",
  },
  {
    id: "pfz-context",
    name: "Fishing Zone Repository",
    organization:
      "Sagar marine layer",
    category: "marine",
    status: "available",
    description:
      "Structured fishing-zone context combining productivity indicators and fishing suitability.",
    datasets: [
      "Fishing zones",
      "PFZ candidates",
      "Chlorophyll context",
      "SST context",
    ],
    role: "Fishing intelligence",
  },
  {
    id: "alert-repository",
    name: "Marine Alert Repository",
    organization:
      "Sagar alert layer",
    category: "operational",
    status: "available",
    description:
      "Structured hazard information used by the alert and risk reasoning layers.",
    datasets: [
      "Lightning",
      "Cyclone",
      "High waves",
      "Strong wind",
      "Rough sea",
      "Restricted areas",
    ],
    role: "Hazard intelligence",
  },
];

type FilterValue =
  | "all"
  | SourceCategory;

function categoryLabel(
  category: SourceCategory,
) {
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
    default:
      return "Source";
  }
}

function categoryIcon(
  category: SourceCategory,
) {
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

function statusLabel(
  status: SourceStatus,
) {
  switch (status) {
    case "integrated":
      return "Integrated";
    case "available":
      return "Available";
    case "partial":
      return "Connected (limited)";
    case "planned":
      return "Not connected";
    default:
      return "Unknown";
  }
}

function statusTone(
  status: SourceStatus,
) {
  switch (status) {
    case "integrated":
      return "success" as const;

    case "available":
      return "violet" as const;

    case "partial":
      return "warning" as const;

    case "planned":
      return "neutral" as const;

    default:
      return "neutral" as const;
  }
}

export default function Sources() {
  const [filter, setFilter] =
    useState<FilterValue>("all");

  const [query, setQuery] =
    useState("");

  const [refreshed, setRefreshed] =
    useState(false);

  const filteredSources = useMemo(() => {
    const search =
      query.trim().toLowerCase();

    return SOURCES.filter((source) => {
      const matchesCategory =
        filter === "all" ||
        source.category === filter;

      const matchesSearch =
        !search ||
        source.name
          .toLowerCase()
          .includes(search) ||
        source.organization
          .toLowerCase()
          .includes(search) ||
        source.description
          .toLowerCase()
          .includes(search) ||
        source.datasets.some((dataset) =>
          dataset
            .toLowerCase()
            .includes(search),
        );

      return (
        matchesCategory &&
        matchesSearch
      );
    });
  }, [filter, query]);

  const integratedCount =
    SOURCES.filter(
      (source) =>
        source.status === "integrated",
    ).length;

  const marineCount =
    SOURCES.filter(
      (source) =>
        source.category === "marine",
    ).length;

  const geospatialCount =
    SOURCES.filter(
      (source) =>
        source.category === "geospatial",
    ).length;

  const refresh = () => {
    setRefreshed(true);

    window.setTimeout(() => {
      setRefreshed(false);
    }, 1400);
  };

  return (
    <AppShell>
      <PageContainer className="sources-page">
        <header className="sources-header">
          <div>
            <div className="sources-eyebrow">
              <Database size={14} />
              Data intelligence
            </div>

            <h1>Data Sources</h1>

            <p>
              Understand the marine, weather,
              satellite and geospatial information
              available to Sagar's reasoning layer.
            </p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={refresh}
          >
            <RefreshCw
              size={15}
              className={
                refreshed
                  ? "sources-spin"
                  : undefined
              }
            />
            {refreshed
              ? "Checked"
              : "Check sources"}
          </Button>
        </header>

        <section className="sources-summary">
          <div className="sources-summary-item">
            <div className="sources-summary-icon">
              <Database size={17} />
            </div>

            <div>
              <span>Total sources</span>
              <strong>
                {SOURCES.length}
              </strong>
            </div>
          </div>

          <div className="sources-summary-item">
            <div className="sources-summary-icon integrated">
              <CheckCircle2 size={17} />
            </div>

            <div>
              <span>Integrated</span>
              <strong>
                {integratedCount}
              </strong>
            </div>
          </div>

          <div className="sources-summary-item">
            <div className="sources-summary-icon marine">
              <Waves size={17} />
            </div>

            <div>
              <span>Marine sources</span>
              <strong>
                {marineCount}
              </strong>
            </div>
          </div>

          <div className="sources-summary-item">
            <div className="sources-summary-icon geo">
              <Map size={17} />
            </div>

            <div>
              <span>Geospatial layers</span>
              <strong>
                {geospatialCount}
              </strong>
            </div>
          </div>
        </section>

        <section className="sources-explanation">
          <div className="sources-explanation-icon">
            <FileSearch size={18} />
          </div>

          <div>
            <h2>
              Evidence-first marine reasoning
            </h2>

            <p>
              Sagar should combine relevant
              observations, forecasts and
              geospatial constraints before
              generating a recommendation. Each
              source has a specific role in the
              reasoning chain rather than being
              treated as an isolated data feed.
            </p>
          </div>
        </section>

        <section className="sources-toolbar">
          <div className="sources-search">
            <Database size={15} />

            <input
              type="search"
              value={query}
              onChange={(event) =>
                setQuery(
                  event.target.value,
                )
              }
              placeholder="Search sources or datasets..."
              aria-label="Search sources"
            />
          </div>

          <div
            className="sources-filters"
            role="group"
            aria-label="Source categories"
          >
            {(
              [
                ["all", "All"],
                ["marine", "Marine"],
                ["weather", "Weather"],
                ["satellite", "Satellite"],
                ["geospatial", "Geospatial"],
                [
                  "operational",
                  "Operational",
                ],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={
                  filter === value
                    ? "sources-filter active"
                    : "sources-filter"
                }
                onClick={() =>
                  setFilter(value)
                }
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="sources-list">
          <div className="sources-list-header">
            <div>
              <span>
                Available information
              </span>

              <h2>
                Source catalogue
              </h2>
            </div>

            <span>
              {filteredSources.length}{" "}
              {filteredSources.length === 1
                ? "source"
                : "sources"}
            </span>
          </div>

          {filteredSources.length === 0 ? (
            <div className="sources-empty">
              <div className="sources-empty-icon">
                <Database size={20} />
              </div>

              <h3>
                No matching sources
              </h3>

              <p>
                Try another category or search
                term.
              </p>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setFilter("all");
                  setQuery("");
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="sources-grid">
              {filteredSources.map(
                (source) => {
                  const Icon =
                    categoryIcon(
                      source.category,
                    );

                  return (
                    <article
                      key={source.id}
                      className="source-card"
                    >
                      <div className="source-card-top">
                        <div
                          className={`source-icon ${source.category}`}
                        >
                          <Icon size={19} />
                        </div>

                        <Badge
                          tone={statusTone(
                            source.status,
                          )}
                          size="sm"
                        >
                          {statusLabel(
                            source.status,
                          )}
                        </Badge>
                      </div>

                      <div className="source-card-heading">
                        <div>
                          <span>
                            {categoryLabel(
                              source.category,
                            )}
                          </span>

                          <h3>
                            {source.name}
                          </h3>
                        </div>
                      </div>

                      <p className="source-organization">
                        {source.organization}
                      </p>

                      <p className="source-description">
                        {source.description}
                      </p>

                      <div className="source-role">
                        <span>
                          Sagar role
                        </span>

                        <strong>
                          {source.role}
                        </strong>
                      </div>

                      <div className="source-datasets">
                        <span>
                          Information
                        </span>

                        <div>
                          {source.datasets.map(
                            (dataset) => (
                              <span
                                key={
                                  dataset
                                }
                              >
                                {dataset}
                              </span>
                            ),
                          )}
                        </div>
                      </div>

                      {source.officialUrl && (
                        <a
                          href={
                            source.officialUrl
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="source-link"
                        >
                          <span>
                            Official source
                          </span>

                          <ExternalLink
                            size={13}
                          />
                        </a>
                      )}
                    </article>
                  );
                },
              )}
            </div>
          )}
        </section>

        <aside className="sources-note">
          <Info size={15} />

          <div>
            <strong>
              Source transparency
            </strong>

            <span>
              “Integrated” identifies a source
              represented in the current Sagar
              architecture. It does not mean every
              value displayed by the prototype is
              being fetched live at this moment.
            </span>
          </div>
        </aside>

        <footer className="sources-footer">
          <span>
            <Activity size={13} />
            Source-aware marine intelligence
          </span>

          <span>
            <Globe2 size={13} />
            Built for heterogeneous marine data
          </span>
        </footer>
      </PageContainer>
    </AppShell>
  );
}