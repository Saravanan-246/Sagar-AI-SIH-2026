export type ChatRole = "user" | "assistant" | "system";

export type ChatLanguage =
  | "en"
  | "ta"
  | "te"
  | "ml"
  | "kn"
  | "hi";

/**
 * How the user mixed languages in a turn - never shown to the user,
 * only used to shape the reply and pick a voice.
 *   native ..... one language in its own script (or plain English)
 *   mixed ...... native script with English technical words
 *                ("இந்த route safe ah? weather எப்படி?")
 *   tanglish ... Tamil written in Latin script ("weather epdi iruku?")
 *   hinglish ... Hindi written in Latin script ("weather kaisa hai?")
 *   romanized .. another Indian language in Latin script
 */
export type ChatLanguageStyle =
  | "native"
  | "mixed"
  | "tanglish"
  | "hinglish"
  | "romanized";

/**
 * The single language decision for one request. Built once, before
 * intent detection, and carried unchanged through the agents, the
 * narrator and back to the client, so the text reply and the spoken
 * reply can never drift into different languages.
 */
export interface LanguageContext {
  /** Dominant conversational language - the reply is written in this. */
  language: ChatLanguage;
  style: ChatLanguageStyle;
  /** Script the user wrote in. */
  script: "latin" | "native" | "mixed";
  confidence: number;
  /** Where the decision came from: the message itself, the AI
   * classifier, earlier turns, the caller's fallback, or the client
   * pinning it for a follow-up it sent on the user's behalf. */
  source: "message" | "classifier" | "history" | "fallback" | "client";
  /** BCP-47 regional locale for speech (e.g. "ta-IN"); the client
   * still checks which voices the device actually has. */
  locale: string;
}

export type ChatIntent =
  | "marine_conditions"
  | "safety"
  | "alerts"
  | "pfz"
  | "route"
  | "productivity"
  | "geofence"
  | "tide"
  | "evidence"
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