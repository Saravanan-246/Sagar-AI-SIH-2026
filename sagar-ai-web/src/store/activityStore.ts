import { create } from "zustand";

export type ActivityType =
  | "chat"
  | "route"
  | "scenario"
  | "alert"
  | "map"
  | "system";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface ActivityState {
  activities: ActivityItem[];

  addActivity: (
    activity: Omit<ActivityItem, "id" | "timestamp">
  ) => void;

  removeActivity: (id: string) => void;
  clearActivities: () => void;
}

const STORAGE_KEY = "sagar-ai-activity";

function loadActivities(): ActivityItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveActivities(activities: ActivityItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activities));
  } catch {
    // Ignore storage errors.
  }
}

const initialActivities =
  typeof window !== "undefined" ? loadActivities() : [];

export const useActivityStore = create<ActivityState>((set) => ({
  activities: initialActivities,

  addActivity: (activity) => {
    const newActivity: ActivityItem = {
      ...activity,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };

    set((state) => {
      const activities = [newActivity, ...state.activities].slice(0, 100);

      saveActivities(activities);

      return { activities };
    });
  },

  removeActivity: (id) => {
    set((state) => {
      const activities = state.activities.filter(
        (activity) => activity.id !== id
      );

      saveActivities(activities);

      return { activities };
    });
  },

  clearActivities: () => {
    saveActivities([]);
    set({ activities: [] });
  },
}));