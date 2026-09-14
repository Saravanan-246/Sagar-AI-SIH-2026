export type ChatRole = "user" | "assistant" | "system";

export type ChatLanguage =
  | "en"
  | "ta"
  | "te"
  | "ml"
  | "kn"
  | "hi";

export type ChatIntent =
  | "marine_conditions"
  | "safety"
  | "alerts"
  | "pfz"
  | "route"
  | "productivity"
  | "geofence"
  | "tide"
  | "general";

export interface ChatEvidence {
  id: string;
  type:
    | "marine"
    | "alert"
    | "productivity"
    | "boundary"
    | "tide"
    | "route"
    | "scenario"
    | "source";

  title: string;
  source?: string;
  summary?: string;

  data?: Record<string, unknown>;
}

export interface ChatContext {
  areaId?: string;
  areaName?: string;

  language?: ChatLanguage;
  intent?: ChatIntent;

  coordinates?: {
    latitude: number;
    longitude: number;
  };

  lastUserMessage?: string;
  lastAssistantMessage?: string;

  metadata?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;

  role: ChatRole;
  content: string;

  timestamp: string;

  language?: ChatLanguage;
  intent?: ChatIntent;

  evidence?: ChatEvidence[];

  context?: ChatContext;

  metadata?: Record<string, unknown>;
}

export interface AskSagarOptions {
  language?: ChatLanguage;

  areaId?: string;
  areaName?: string;

  context?: ChatContext;

  conversation?: ChatMessage[];
}

export interface SagarResponse {
  message: ChatMessage;

  intent: ChatIntent;
  language: ChatLanguage;

  evidence: ChatEvidence[];

  context: ChatContext;
}