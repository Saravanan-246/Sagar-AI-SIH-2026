export const APP_CONFIG = {
  appName: "SAGAR",
  appFullName: "Sagar AI",
  tagline: "Marine Intelligence",

  version: "1.0.0",

  map: {
    // Centered along the Tamil Nadu coastal midpoint to cover Chennai to Kanyakumari
    defaultCenter: [10.2000, 79.2000] as [number, number],
    defaultZoom: 7,
    minZoom: 5,
    maxZoom: 18,

    // Public OpenStreetMap tile server - 100% free, no API key, no watermark
    tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",

    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
  },

  marine: {
    defaultArea: "Tamil Nadu Coast",
    defaultCoordinates: {
      latitude: 10.2000,
      longitude: 79.2000,
    },
  },

  ai: {
    assistantName: "Sagar",
    typingDelay: 500,
    maxMessages: 100,
  },

  route: {
    defaultSpeedKnots: 7,
    minimumSpeedKnots: 2,
    maximumSpeedKnots: 20,
  },

  risk: {
    lowMax: 30,
    moderateMax: 60,
    highMax: 80,
  },

  storage: {
    chat: "sagar-ai-chat",
    activity: "sagar-ai-activity",
    preferences: "sagar-ai-preferences",
  },

  features: {
    marineMap: true,
    askSagar: true,
    routePlanning: true,
    scenarioAnalysis: true,
    alerts: true,
    activity: true,
    dataSources: true,
    fishingZones: true,
    geofencing: true,
    productivityAnalysis: true,
  },
} as const;

export type AppConfig = typeof APP_CONFIG;