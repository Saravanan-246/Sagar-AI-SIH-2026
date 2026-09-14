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
}));