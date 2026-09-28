import type { ChatLanguage } from "../types/chat";

/*
 * One place that turns a language decision into a BCP-47 locale for the
 * browser's speech APIs. It only states a preference - which voice is
 * actually used is decided at speak time by useVoiceOutput.selectVoice
 * against the voices the device really has (preferred locale -> same
 * region -> same language -> an English voice for Latin-script text),
 * so nothing here assumes a voice exists.
 */

export const LOCALE_BY_LANGUAGE: Record<ChatLanguage, string> = {
  en: "en-IN",
  ta: "ta-IN",
  te: "te-IN",
  ml: "ml-IN",
  kn: "kn-IN",
  hi: "hi-IN",
};

const SCRIPT_LOCALES: Array<[RegExp, string]> = [
  [/[஀-௿]/, "ta-IN"],
  [/[ऀ-ॿ]/, "hi-IN"],
  [/[ఀ-౿]/, "te-IN"],
  [/[ഀ-ൿ]/, "ml-IN"],
  [/[ಀ-೿]/, "kn-IN"],
];

export function isChatLanguage(value: unknown): value is ChatLanguage {
  return typeof value === "string" && value in LOCALE_BY_LANGUAGE;
}

/** Locale the speech recognizer should listen in for a language. */
export function recognitionLocaleFor(language: ChatLanguage): string {
  return LOCALE_BY_LANGUAGE[language] ?? "en-IN";
}

/**
 * Locale to speak a reply in. The reply's own script wins: Tamil text
 * is read by a Tamil voice even if the request context was unclear. A
 * Tanglish/Hinglish reply is Latin text, which a Tamil/Hindi voice
 * reads letter by letter on most devices, so it goes to an Indian
 * English voice - the closest natural reading of romanised speech.
 */
export function speechLocaleFor(text: string): string {
  const byScript = SCRIPT_LOCALES.find(([pattern]) => pattern.test(text));
  // Latin text - English, Tanglish, Hinglish, or an English fallback
  // answer to a Tamil question - is read correctly by an English voice.
  return byScript ? byScript[1] : "en-IN";
}
