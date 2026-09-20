import { create } from "zustand";

import type { RoutePlan } from "../types/route";

export type AppLanguage =
  | "en"
  | "ta"
  | "te"
  | "ml"
  | "kn"
  | "hi";

export interface AppPreferences {
  language: AppLanguage;
  defaultArea: string;
  severeAlerts: boolean;
  geofenceAlerts: boolean;
}

interface AppState {
  isSidebarOpen: boolean;
  isMobileNavOpen: boolean;

  language: AppLanguage;
  defaultArea: string;

  severeAlerts: boolean;
  geofenceAlerts: boolean;

  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  setMobileNavOpen: (open: boolean) => void;

  setLanguage: (language: AppLanguage) => void;
  setDefaultArea: (area: string) => void;

  setSevereAlerts: (enabled: boolean) => void;
  setGeofenceAlerts: (enabled: boolean) => void;

  getPreferences: () => AppPreferences;

  /** A route Sagar found in chat, pending pickup by the Route Planning page. */
  pendingRoute: RoutePlan | null;
  setPendingRoute: (route: RoutePlan) => void;
  clearPendingRoute: () => void;

  /** A question built from real page context (e.g. the Route page's
   * selected route), pending pickup by Chat - asked through Chat's own
   * existing send pipeline, never a second chat mechanism. */
  pendingChatPrompt: string | null;
  setPendingChatPrompt: (prompt: string) => void;
  clearPendingChatPrompt: () => void;

  /**
   * The user's working location for chat/marine/route queries - either a
   * device-geolocation coordinate or a manually selected marine area.
   * Shared across Chat, Map and Route so "use my location" / "select
   * area" set once and apply everywhere.
   */
  currentLocation: {
    latitude: number;
    longitude: number;
  } | null;
  selectedAreaId: string | null;
  locationLabel: string | null;
  locationPermission: "unknown" | "granted" | "denied" | "unavailable";

  setDeviceLocation: (
    coords: { latitude: number; longitude: number },
    label?: string
  ) => void;
  setSelectedArea: (areaId: string, label: string) => void;
  setLocationPermission: (
    status: "unknown" | "granted" | "denied" | "unavailable"
  ) => void;
  clearLocation: () => void;

  /** A map focus request (area/coordinates) pending pickup by the Map page. */
  pendingMapFocus: {
    latitude?: number;
    longitude?: number;
    areaId?: string;
    label?: string;
  } | null;
  setPendingMapFocus: (
    focus: {
      latitude?: number;
      longitude?: number;
      areaId?: string;
      label?: string;
    }
  ) => void;
  clearPendingMapFocus: () => void;
}

const STORAGE_KEY = "sagar-ai-preferences";

const DEFAULT_PREFERENCES: AppPreferences = {
  language: "en",
  defaultArea: "Gulf of Mannar",
  severeAlerts: true,
  geofenceAlerts: true,
};

function loadPreferences(): AppPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_PREFERENCES;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return DEFAULT_PREFERENCES;
    }

    const parsed = JSON.parse(stored);

    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function savePreferences(preferences: AppPreferences) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(preferences)
    );
  } catch {
    // Ignore storage errors.
  }
}

const initialPreferences = loadPreferences();

export const useAppStore = create<AppState>((set, get) => ({
  isSidebarOpen: false,
  isMobileNavOpen: false,

  language: initialPreferences.language,
  defaultArea: initialPreferences.defaultArea,

  severeAlerts: initialPreferences.severeAlerts,
  geofenceAlerts: initialPreferences.geofenceAlerts,

  setSidebarOpen: (open) => {
    set({ isSidebarOpen: open });
  },

  toggleSidebar: () => {
    set((state) => ({
      isSidebarOpen: !state.isSidebarOpen,
    }));
  },

  setMobileNavOpen: (open) => {
    set({ isMobileNavOpen: open });
  },

  setLanguage: (language) => {
    set((state) => {
      const preferences: AppPreferences = {
        language,
        defaultArea: state.defaultArea,
        severeAlerts: state.severeAlerts,
        geofenceAlerts: state.geofenceAlerts,
      };

      savePreferences(preferences);

      return { language };
    });
  },

  setDefaultArea: (area) => {
    set((state) => {
      const preferences: AppPreferences = {
        language: state.language,
        defaultArea: area,
        severeAlerts: state.severeAlerts,
        geofenceAlerts: state.geofenceAlerts,
      };

      savePreferences(preferences);

      return { defaultArea: area };
    });
  },

  setSevereAlerts: (enabled) => {
    set((state) => {
      const preferences: AppPreferences = {
        language: state.language,
        defaultArea: state.defaultArea,
        severeAlerts: enabled,
        geofenceAlerts: state.geofenceAlerts,
      };

      savePreferences(preferences);

      return { severeAlerts: enabled };
    });
  },

  setGeofenceAlerts: (enabled) => {
    set((state) => {
      const preferences: AppPreferences = {
        language: state.language,
        defaultArea: state.defaultArea,
        severeAlerts: state.severeAlerts,
        geofenceAlerts: enabled,
      };

      savePreferences(preferences);

      return { geofenceAlerts: enabled };
    });
  },

  getPreferences: () => {
    const state = get();

    return {
      language: state.language,
      defaultArea: state.defaultArea,
      severeAlerts: state.severeAlerts,
      geofenceAlerts: state.geofenceAlerts,
    };
  },

  pendingRoute: null,

  setPendingRoute: (route) => {
    set({ pendingRoute: route });
  },

  clearPendingRoute: () => {
    set({ pendingRoute: null });
  },

  pendingChatPrompt: null,

  setPendingChatPrompt: (prompt) => {
    set({ pendingChatPrompt: prompt });
  },

  clearPendingChatPrompt: () => {
    set({ pendingChatPrompt: null });
  },

  currentLocation: null,
  selectedAreaId: null,
  locationLabel: null,
  locationPermission: "unknown",

  setDeviceLocation: (coords, label) => {
    set({
      currentLocation: coords,
      selectedAreaId: null,
      locationLabel: label ?? "Current location",
      locationPermission: "granted",
    });
  },

  setSelectedArea: (areaId, label) => {
    set({
      selectedAreaId: areaId,
      currentLocation: null,
      locationLabel: label,
    });
  },

  setLocationPermission: (status) => {
    set({ locationPermission: status });
  },

  clearLocation: () => {
    set({
      currentLocation: null,
      selectedAreaId: null,
      locationLabel: null,
    });
  },

  pendingMapFocus: null,

  setPendingMapFocus: (focus) => {
    set({ pendingMapFocus: focus });
  },

  clearPendingMapFocus: () => {
    set({ pendingMapFocus: null });
  },
}));