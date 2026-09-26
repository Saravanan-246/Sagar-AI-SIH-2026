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
  /** "unclear" only for genuinely unintelligible input (e.g. "xyzabc") -
   * never for a message that's merely typo'd, ungrammatical, informal
   * or Tanglish and still has a discernible meaning. Lets the chat
   * route ask for a rephrase instead of guessing, without conflating
   * "I couldn't parse this at all" with an ordinary messy-but-readable
   * message (the overwhelmingly common case, which should just be
   * answered). */
  clarity: "clear" | "unclear";
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
  clarity: z.enum(["clear", "unclear"]).optional().default("clear"),
});

const SYSTEM_PROMPT = `You are a classifier for Sagar, a marine safety assistant for small-craft fishermen in Tamil Nadu, India.

Real fishermen type on cheap phones, often one-handed, sometimes in a hurry. Expect and understand: misspellings ("wether" = weather, "fshing" = fishing, "condisn" = condition, "safty" = safety), missing/extra/repeated letters ("tomorow", "weatherrr", "hellooo"), missing or extra spaces, missing/excess punctuation, ALL CAPS or no caps, broken grammar ("tomorrow fishing go can?", "which route take?"), short incomplete fragments ("weather?", "wind?", "why?"), and natural Tamil-English mixing / Tanglish ("sea epdi iruku", "wind romba high ah?", "route safe ah?", "indha area risky ah?"). Read past all of that to the underlying question - do not get stuck on individual misspelled words, and never classify a message as unrelated just because it is messy. A message can also combine several of these problems at once (typos AND Tanglish AND missing punctuation in the same sentence) - interpret the WHOLE sentence's meaning, not word-by-word.

Given the latest user message and a short recent conversation history, output ONLY a compact JSON object (no prose, no markdown fences) with this exact shape:

{"intent": "<one of: marine_conditions|safety|alerts|pfz|route|productivity|geofence|tide|general>", "secondaryIntents": ["<zero or more of the same list, excluding intent>"], "areaHint": "<a place name mentioned or implied by the conversation, or omit if none>", "isWhatIf": <true if this is a hypothetical "what if" question, else false>, "language": "<one of: en|ta|te|ml|kn|hi, matching the language of the LATEST message>", "clarity": "<'clear' if you can confidently tell what the user means despite any typos/grammar/Tanglish, or 'unclear' ONLY if the message is genuine gibberish with no discernible meaning at all (e.g. 'xyzabc', random keyboard mashing)>"}

Guidance:
- "safety" = can I go / is it safe / any danger.
- "alerts" = cyclone/lightning/storm/warnings.
- "pfz" = fishing zone recommendations, which zone is better/best.
- "productivity" = why has productivity/catch changed, trends.
- "route" = which route, safest route, route from A to B, "show south route".
- "geofence" = restricted/protected areas, boundaries.
- "tide" = tide times/height.
- "marine_conditions" = wind/wave/weather/visibility/sea-state readings.
- "general" = anything else: greetings, thanks, small talk, acknowledgements ("bro", "ok", "nice", "thanks bro"), unrelated questions, or a short incomplete fragment with no context to resolve it against.
- A bare greeting, acknowledgement or casual remark is ALWAYS "general" (clarity "clear" - these are perfectly understandable, just not a data question), even in the middle of a conversation that was previously about a marine topic - conversation history is there so you don't misread a real follow-up question, never so you tie an unrelated "bro" or "thanks" back to the earlier marine answer. Only resolve a short message against history when it is itself actually asking or requesting something.
- "clarity": "unclear" is rare and reserved for input with NO recoverable meaning at all. A typo'd, ungrammatical, fragmentary, or Tanglish message that you can still confidently interpret is "clear" - do not mark it "unclear" just because it isn't proper English. When genuinely unsure between two specific interpretations, still pick the more likely "intent" and use "clear"; "unclear" is only for true noise.
- If the message combines two needs (e.g. "wether tomoro and fshing safe ah?" = weather tomorrow AND is fishing safe), put the main one in "intent" and the other in "secondaryIntents" - never drop the second question just because part of the sentence was about something else or was typo'd.
- If the message is a short follow-up question, including one with its own typos ("wind romba hig ah?" after a sea-conditions answer, "is that dngerous?" after a wind answer), use the recent history to resolve what "that"/"it"/the implicit topic refers to, and set "areaHint" or "intent" accordingly.
- areaHint should be a short place name fragment (e.g. "southern", "Thoothukudi", "Northern Gulf of Mannar") - omit the field entirely if nothing is implied. Never "correct" a proper noun (place name, INCOIS/IMD/ISRO, PFZ, a boat name, etc.) into a different word.
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
  history: ConversationTurn[] = [],
  /** Caller's remaining request budget; omitted = provider default. */
  timeoutMs?: number
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
    // maxTokens kept deliberately small: the model only ever emits one
    // compact JSON line here, and a low cap keeps this call affordable
    // even when the configured OpenRouter account has little balance
    // left. A local provider raises this to its own floor (see
    // MIN_MAX_TOKENS in ollamaProvider.ts), since local tokens are free
    // and a truncated JSON line would just fail to parse.
    //
    // No fixed short timeoutMs here (deliberately, not an oversight) -
    // only the chat route's remaining request budget, when passed: each
    // provider already carries its own well-tuned default -
    // OpenRouter's own client always uses its fast fixed cloud timeout
    // regardless of what's passed, while Ollama's is set generously
    // (config.llm.ollama.timeoutMs, default 30s) because local
    // generation on real hardware routinely takes several seconds.
    // Overriding that down to a fixed short bound here previously
    // caused real local-model classification calls to time out on
    // ordinary messages, silently falling back to a worse deterministic
    // guess - measured in practice, not theoretical.
    // Slightly larger than the JSON object alone strictly needs, since
    // the added "clarity" field and the richer guidance above give the
    // model a bit more to work through before it settles on the answer.
    { temperature: 0, maxTokens: 150, timeoutMs }
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
      clarity: parsed.clarity,
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
