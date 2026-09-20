import {
  Activity as ActivityIcon,
  Bell,
  Bot,
  ChevronRight,
  Clock3,
  Compass,
  Filter,
  Map,
  Route as RouteIcon,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Waves,
} from "lucide-react";
import { useMemo, useState } from "react";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import { APP_CONFIG } from "../constants/config";

import "./Activity.css";

type ActivityType =
  | "question"
  | "route"
  | "scenario"
  | "alert"
  | "map"
  | "system";

type ActivityItem = {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
  metadata?: string;
};

type FilterKey = "all" | ActivityType;

const ACTIVITY_STORAGE_KEY = APP_CONFIG.storage.activity;

function isActivityType(value: unknown): value is ActivityType {
  return (
    value === "question" ||
    value === "route" ||
    value === "scenario" ||
    value === "alert" ||
    value === "map" ||
    value === "system"
  );
}

function readActivities(): ActivityItem[] {
  try {
    const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    const source = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" &&
          parsed !== null &&
          Array.isArray((parsed as { activities?: unknown }).activities)
        ? (parsed as { activities: unknown[] }).activities
        : [];

    return source
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null
      )
      .map((item, index) => ({
        id: typeof item.id === "string" ? item.id : `activity-${index}`,
        type: isActivityType(item.type) ? item.type : "system",
        title:
          typeof item.title === "string"
            ? item.title
            : typeof item.name === "string"
              ? item.name
              : "Activity",
        description:
          typeof item.description === "string"
            ? item.description
            : typeof item.text === "string"
              ? item.text
              : "",
        timestamp:
          typeof item.timestamp === "string"
            ? item.timestamp
            : new Date().toISOString(),
        metadata:
          typeof item.metadata === "string" ? item.metadata : undefined,
      }));
  } catch (error) {
    console.error("Failed to read activity history:", error);
    return [];
  }
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getIcon(type: ActivityType) {
  switch (type) {
    case "question":
      return Bot;
    case "route":
      return RouteIcon;
    case "scenario":
      return SlidersHorizontal;
    case "alert":
      return Bell;
    case "map":
      return Map;
    default:
      return ActivityIcon;
  }
}

function getLabel(type: ActivityType) {
  switch (type) {
    case "question":
      return "Ask Sagar";
    case "route":
      return "Route";
    case "scenario":
      return "Scenario";
    case "alert":
      return "Alert";
    case "map":
      return "Map";
    default:
      return "System";
  }
}

function getTone(type: ActivityType) {
  switch (type) {
    case "question":
      return "violet" as const;
    case "route":
      return "success" as const;
    case "scenario":
      return "warning" as const;
    case "alert":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

export default function Activity() {
  const [activities, setActivities] = useState<ActivityItem[]>(() =>
    readActivities()
  );

  const [filter, setFilter] = useState<FilterKey>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filteredActivities = useMemo(() => {
    const filtered =
      filter === "all"
        ? activities
        : activities.filter((item) => item.type === filter);

    return [...filtered].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [activities, filter]);

  const questionCount = activities.filter(
    (item) => item.type === "question"
  ).length;

  const routeCount = activities.filter(
    (item) => item.type === "route"
  ).length;

  const scenarioCount = activities.filter(
    (item) => item.type === "scenario"
  ).length;

  const refresh = () => {
    setActivities(readActivities());
  };

  const clearActivity = () => {
    try {
      localStorage.removeItem(ACTIVITY_STORAGE_KEY);
      setActivities([]);
    } catch (error) {
      console.error("Failed to clear activity:", error);
    }
  };

  return (
    <AppShell>
      <PageContainer className="activity-page">
        <section className="activity-page-header">
          <div className="activity-title-block">
            <div className="activity-eyebrow">
              <ActivityIcon size={14} />
              Decision history
            </div>

            <h1>Activity</h1>

            <p>
              Review your recent Sagar questions, routes, scenarios and marine alerts
              in one place.
            </p>
          </div>

          <div className="activity-header-actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={refresh}
            >
              <Clock3 size={15} />
              Refresh
            </Button>

            {activities.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearActivity}
              >
                <Trash2 size={15} />
                Clear
              </Button>
            )}
          </div>
        </section>

        <section
          className="activity-summary"
          aria-label="Activity summary"
        >
          <div className="activity-summary-item">
            <div className="activity-summary-icon violet">
              <Sparkles size={17} />
            </div>

            <div>
              <span>Total activity</span>
              <strong>{activities.length}</strong>
            </div>
          </div>

          <div className="activity-summary-item">
            <div className="activity-summary-icon">
              <Bot size={17} />
            </div>

            <div>
              <span>Sagar questions</span>
              <strong>{questionCount}</strong>
            </div>
          </div>

          <div className="activity-summary-item">
            <div className="activity-summary-icon">
              <Compass size={17} />
            </div>

            <div>
              <span>Routes reviewed</span>
              <strong>{routeCount}</strong>
            </div>
          </div>

          <div className="activity-summary-item">
            <div className="activity-summary-icon">
              <Waves size={17} />
            </div>

            <div>
              <span>Scenarios tested</span>
              <strong>{scenarioCount}</strong>
            </div>
          </div>
        </section>

        <section className="activity-section">
          <div className="activity-toolbar">
            <div>
              <h2>Recent activity</h2>
              <span>
                {filteredActivities.length}{" "}
                {filteredActivities.length === 1 ? "record" : "records"}
              </span>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setFiltersOpen((current) => !current)}
            >
              <Filter size={15} />
              Filter
            </Button>
          </div>

          {filtersOpen && (
            <div
              className="activity-filter-bar"
              role="group"
              aria-label="Activity filters"
            >
              {(
                [
                  ["all", "All"],
                  ["question", "Questions"],
                  ["route", "Routes"],
                  ["scenario", "Scenarios"],
                  ["alert", "Alerts"],
                  ["map", "Map"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={
                    filter === value
                      ? "activity-filter active"
                      : "activity-filter"
                  }
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {filteredActivities.length === 0 ? (
            <div className="activity-empty">
              <EmptyState
                icon={ActivityIcon}
                title={
                  filter === "all"
                    ? "No activity yet"
                    : "No matching activity"
                }
                description={
                  filter === "all"
                    ? "Your Sagar questions, route decisions and scenario results will appear here."
                    : "There are no records for this filter yet."
                }
                action={
                  filter !== "all"
                    ? {
                        label: "Show all activity",
                        onClick: () => setFilter("all"),
                      }
                    : undefined
                }
              />
            </div>
          ) : (
            <div className="activity-list">
              {filteredActivities.map((activity, index) => {
                const Icon = getIcon(activity.type);

                return (
                  <article
                    key={activity.id}
                    className="activity-record"
                  >
                    <div className="activity-record-rail">
                      <div
                        className={`activity-record-icon ${activity.type}`}
                      >
                        <Icon size={17} />
                      </div>

                      {index < filteredActivities.length - 1 && (
                        <span className="activity-record-line" />
                      )}
                    </div>

                    <div className="activity-record-body">
                      <div className="activity-record-top">
                        <div className="activity-record-heading">
                          <div className="activity-record-meta">
                            <Badge
                              tone={getTone(activity.type)}
                              size="sm"
                            >
                              {getLabel(activity.type)}
                            </Badge>

                            <span>
                              {formatTimestamp(activity.timestamp)}
                            </span>
                          </div>

                          <h3>{activity.title}</h3>
                        </div>

                        <ChevronRight
                          size={17}
                          className="activity-record-chevron"
                        />
                      </div>

                      {activity.description && (
                        <p>{activity.description}</p>
                      )}

                      {activity.metadata && (
                        <span className="activity-record-metadata">
                          {activity.metadata}
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="activity-disclaimer">
          <ShieldAlert size={15} />

          <span>
            Activity records describe decisions made in Sagar. They do not replace
            official marine warnings or navigation guidance.
          </span>
        </aside>
      </PageContainer>
    </AppShell>
  );
}