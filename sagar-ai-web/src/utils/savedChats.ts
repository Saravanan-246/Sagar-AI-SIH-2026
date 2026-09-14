import type { AppLanguage } from "../store/appStore";

export interface SavedChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp?: string;
  language?: string;
  structured?: {
    riskLevel?: string;
    riskScore?: number;
    keyFactors?: string[];
    evidenceTitles?: string[];
    whatIfSummary?: string;
  };
}

export interface SavedChat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  language: AppLanguage;
  areaId: string | null;
  areaLabel: string | null;
  messages: SavedChatMessage[];
}

const STORAGE_KEY = "sagar-ai-saved-chats";
const MAX_SAVED_CHATS = 50;
const TITLE_MAX_LENGTH = 48;

function loadAll(): SavedChat[] {
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

function persistAll(chats: SavedChat[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    // Ignore storage errors (e.g. quota exceeded, private browsing).
  }
}

/** Deterministic title from the first meaningful user message - no AI call. */
export function deriveChatTitle(messages: SavedChatMessage[]): string {
  const firstUserMessage = messages.find(
    (message) => message.role === "user" && message.text.trim().length > 0
  );

  if (!firstUserMessage) {
    return "New conversation";
  }

  const text = firstUserMessage.text.trim().replace(/\s+/g, " ");

  return text.length > TITLE_MAX_LENGTH
    ? `${text.slice(0, TITLE_MAX_LENGTH).trim()}…`
    : text;
}

export function listSavedChats(): SavedChat[] {
  return loadAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getSavedChat(id: string): SavedChat | null {
  return loadAll().find((chat) => chat.id === id) ?? null;
}

export interface SaveChatInput {
  id?: string | null;
  messages: SavedChatMessage[];
  language: AppLanguage;
  areaId: string | null;
  areaLabel: string | null;
}

export function saveChat(input: SaveChatInput): SavedChat {
  const chats = loadAll();
  const now = new Date().toISOString();

  const existingIndex = input.id
    ? chats.findIndex((chat) => chat.id === input.id)
    : -1;

  const record: SavedChat = {
    id: existingIndex >= 0 ? chats[existingIndex].id : `chat-${Date.now()}`,
    title: deriveChatTitle(input.messages),
    createdAt: existingIndex >= 0 ? chats[existingIndex].createdAt : now,
    updatedAt: now,
    language: input.language,
    areaId: input.areaId,
    areaLabel: input.areaLabel,
    messages: input.messages,
  };

  if (existingIndex >= 0) {
    chats[existingIndex] = record;
  } else {
    chats.unshift(record);
  }

  persistAll(chats.slice(0, MAX_SAVED_CHATS));

  return record;
}

export function deleteSavedChat(id: string): void {
  persistAll(loadAll().filter((chat) => chat.id !== id));
}
