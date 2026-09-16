import { z } from "zod";

import { requestLlmCompletion } from "../llm/llmProvider";

import type { ChatIntent, ChatLanguage } from "../../types/chat";

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AiClassification {
  /** Primary intent driving the main backend pipeline run. */
  intent: ChatIntent;
  /** Any additional intents mentioned in the same message (multi-intent). */
  secondaryIntents: ChatIntent[];
  /** A place name mentioned or implied (including via follow-up reference). */
  areaHint?: string;
  /** Whether this reads as a "what if ..." hypothetical. */
  isWhatIf: boolean;
  language: ChatLanguage;
}

const CHAT_INTENTS: ChatIntent[] = [
  "marine_conditions",
  "safety",
  "alerts",
  "pfz",
  "route",
  "productivity",
  "geofence",
  "tide",
  "general",
];

const CHAT_LANGUAGES: ChatLanguage[] = [
  "en",
  "ta",
  "te",
  "ml",
  "kn",
  "hi",
];

const classificationSchema = z.object({
  intent: z.enum(CHAT_INTENTS as [ChatIntent, ...ChatIntent[]]),
  secondaryIntents: z
    .array(z.enum(CHAT_INTENTS as [ChatIntent, ...ChatIntent[]]))
    .optional()
    .default([]),
  areaHint: z.string().trim().min(1).optional(),
  isWhatIf: z.boolean().optional().default(false),
  language: z
    .enum(CHAT_LANGUAGES as [ChatLanguage, ...ChatLanguage[]])
    .optional()
    .default("en"),
});

const SYSTEM_PROMPT = `You are a classifier for Sagar, a marine safety assistant for small-craft fishermen in Tamil Nadu, India.

Given the latest user message and a short recent conversation history, output ONLY a compact JSON object (no prose, no markdown fences) with this exact shape:

{"intent": "<one of: marine_conditions|safety|alerts|pfz|route|productivity|geofence|tide|general>", "secondaryIntents": ["<zero or more of the same list, excluding intent>"], "areaHint": "<a place name mentioned or implied by the conversation, or omit if none>", "isWhatIf": <true if this is a hypothetical "what if" question, else false>, "language": "<one of: en|ta|te|ml|kn|hi, matching the language of the LATEST message>"}

Guidance:
- "safety" = can I go / is it safe / any danger.
- "alerts" = cyclone/lightning/storm/warnings.
- "pfz" = fishing zone recommendations, which zone is better/best.
- "productivity" = why has productivity/catch changed, trends.
- "route" = which route, safest route, route from A to B, "show south route".
- "geofence" = restricted/protected areas, boundaries.
- "tide" = tide times/height.
- "marine_conditions" = wind/wave/visibility/sea-state readings.
- "general" = anything else: greetings, thanks, small talk, acknowledgements ("bro", "ok", "nice", "thanks bro"), unrelated questions, or unclear/empty-ish input (".", "...", "?").
- A bare greeting, acknowledgement or casual remark is ALWAYS "general", even in the middle of a conversation that was previously about a marine topic - conversation history is there so you don't misread a real follow-up question, never so you tie an unrelated "bro" or "thanks" back to the earlier marine answer. Only resolve a short message against history when it is itself actually asking or requesting something.
- If the message combines two needs (e.g. "can I fish tomorrow and which route is safer"), put the main one in "intent" and the other in "secondaryIntents".
- If the message is a short follow-up question ("what about the southern route?", "what about wind?", "and tomorrow?"), use the recent history to resolve what it refers to, and set "areaHint" or "intent" accordingly.
- areaHint should be a short place name fragment (e.g. "southern", "Thoothukudi", "Northern Gulf of Mannar") - omit the field entirely if nothing is implied.
- Never include commentary. Output the JSON object only.`;

function buildHistoryText(history: ConversationTurn[]): string {
  if (history.length === 0) {
    return "(no prior messages)";
  }

  return history
    .slice(-6)
    .map(
      (turn) =>
        `${turn.role === "user" ? "User" : "Sagar"}: ${turn.text}`
    )
    .join("\n");
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in classifier output.");
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Classifies a free-form marine question using the configured AI model.
 * Returns `null` whenever the AI is unavailable, errors, times out, or
 * returns something that doesn't validate against Sagar's real intent
 * set - callers should fall back to the existing deterministic
 * interactionAgent/intent.ts detection in every such case.
 */
export async function classifyWithAi(
  message: string,
  history: ConversationTurn[] = []
): Promise<AiClassification | null> {
  const raw = await requestLlmCompletion(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Recent conversation:\n${buildHistoryText(
          history
        )}\n\nLatest message: ${message}`,
      },
    ],
    // Kept deliberately small: the model only ever emits one compact JSON
    // line here, and a low cap keeps this call affordable even when the
    // configured OpenRouter account has little balance left. A local
    // provider raises this to its own floor, since local tokens are free
    // and a truncated JSON line would just fail to parse.
    { temperature: 0, maxTokens: 100 }
  );

  if (!raw) {
    return null;
  }

  try {
    const parsed = classificationSchema.parse(extractJsonObject(raw));

    return {
      intent: parsed.intent,
      secondaryIntents: parsed.secondaryIntents.filter(
        (item) => item !== parsed.intent
      ),
      areaHint: parsed.areaHint,
      isWhatIf: parsed.isWhatIf,
      language: parsed.language,
    };
  } catch (error) {
    console.warn(
      "[ai] Could not parse intent classification, falling back:",
      error instanceof Error ? error.message : "unknown error"
    );
    return null;
  }
}

export default classifyWithAi;
