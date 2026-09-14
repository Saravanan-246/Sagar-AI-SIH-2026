import { create } from "zustand";
import type { ChatMessage } from "../types/chat";

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;

  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;

  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  clearChat: () => void;
}

const STORAGE_KEY = "sagar-ai-chat";

function loadMessages(): ChatMessage[] {
  if (typeof window === "undefined") {
    return [];
  }

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

function saveMessages(messages: ChatMessage[]) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(messages)
    );
  } catch {
    // Ignore storage errors.
  }
}

const initialMessages =
  typeof window !== "undefined" ? loadMessages() : [];

export const useChatStore = create<ChatState>((set) => ({
  messages: initialMessages,

  isLoading: false,
  error: null,

  addMessage: (message) => {
    set((state) => {
      const messages = [...state.messages, message].slice(-100);

      saveMessages(messages);

      return {
        messages,
        error: null,
      };
    });
  },

  setMessages: (messages) => {
    const trimmed = messages.slice(-100);

    saveMessages(trimmed);

    set({
      messages: trimmed,
      error: null,
    });
  },

  setLoading: (loading) => {
    set({
      isLoading: loading,
    });
  },

  setError: (error) => {
    set({
      error,
    });
  },

  clearChat: () => {
    saveMessages([]);

    set({
      messages: [],
      isLoading: false,
      error: null,
    });
  },
}));