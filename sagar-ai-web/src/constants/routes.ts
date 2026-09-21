export const ROUTES = {
  HOME: "/",
  MAP: "/map",
  CHAT: "/chat",
  ROUTE: "/route",
  SCENARIO: "/scenario",
  ALERTS: "/alerts",
  ACTIVITY: "/activity",
  SOURCES: "/sources",
  PROFILE: "/profile",
  SST_LAB: "/research/sst",
  MARINE_LAB: "/research/marine-lab",

  AREA: (id: string) => `/area/${id}`,
} as const;

export const NAVIGATION_ROUTES = [
  {
    path: ROUTES.HOME,
    label: "Home",
  },
  {
    path: ROUTES.MAP,
    label: "Marine Map",
  },
  {
    path: ROUTES.CHAT,
    label: "Ask Sagar",
  },
] as const;

export const OPERATION_ROUTES = [
  {
    path: ROUTES.ROUTE,
    label: "Route Planning",
  },
  {
    path: ROUTES.SCENARIO,
    label: "What-If Analysis",
  },
  {
    path: ROUTES.ALERTS,
    label: "Marine Alerts",
  },
] as const;

export const SYSTEM_ROUTES = [
  {
    path: ROUTES.ACTIVITY,
    label: "Activity",
  },
  {
    path: ROUTES.SOURCES,
    label: "Data Sources",
  },
  {
    path: ROUTES.PROFILE,
    label: "Profile",
  },
] as const;

export const ALL_ROUTES = [
  ...NAVIGATION_ROUTES,
  ...OPERATION_ROUTES,
  ...SYSTEM_ROUTES,
] as const;

export type AppRoute = (typeof ALL_ROUTES)[number]["path"];