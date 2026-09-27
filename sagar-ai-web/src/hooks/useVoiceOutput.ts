import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceOutputStatus = "idle" | "speaking" | "paused" | "error" | "unavailable";

export type VoiceMatch =
  | { kind: "native"; voice: SpeechSynthesisVoice | null; lang: string }
  | { kind: "fallback"; voice: SpeechSynthesisVoice; lang: string }
  | { kind: "none" };

function getVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return [];
  }
  return window.speechSynthesis.getVoices();
}

const normLang = (lang: string) => lang.replace("_", "-").toLowerCase();

/**
 * Picks the best real voice the device has for `locale`:
 *   1. exact locale (ta-IN), preferring a local voice
 *   2. same language, any region (ta-LK)
 *   3. for Latin-script text only (English, Tanglish, Hinglish) - an
 *      Indian-English then any English voice, which reads romanised
 *      words sensibly. Native-script text is never handed to an
 *      English voice: it would be skipped or spelled out.
 * An empty voice list means "not loaded yet", so synthesis is still
 * attempted with just `lang` set and onerror stays authoritative.
 */
export function selectVoice(
  locale: string,
  text: string,
  voices: SpeechSynthesisVoice[] = getVoices(),
): VoiceMatch {
  if (voices.length === 0) {
    return { kind: "native", voice: null, lang: locale };
  }

  const wanted = normLang(locale);
  const primary = wanted.split("-")[0];
  const byPreference = (list: SpeechSynthesisVoice[]) =>
    [...list].sort((a, b) => Number(b.localService) - Number(a.localService))[0];

  const exact = voices.filter((voice) => normLang(voice.lang) === wanted);
  if (exact.length) return { kind: "native", voice: byPreference(exact), lang: locale };

  const sameLanguage = voices.filter((voice) => normLang(voice.lang).startsWith(`${primary}-`) || normLang(voice.lang) === primary);
  if (sameLanguage.length) {
    const voice = byPreference(sameLanguage);
    return { kind: "native", voice, lang: voice.lang };
  }

  const isLatinText = !/[ऀ-෿]/.test(text);
  if (isLatinText) {
    const english =
      voices.filter((voice) => normLang(voice.lang) === "en-in").concat(
        voices.filter((voice) => normLang(voice.lang).startsWith("en")),
      );
    if (english.length) return { kind: "fallback", voice: english[0], lang: english[0].lang };
  }

  return { kind: "none" };
}

/** Markdown and screen-only content would otherwise be read out
 * literally ("asterisk asterisk", full URLs, table pipes, "Sources:"
 * dumps). Only strips presentation - never the answer's words. */
export function toSpeakableText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^\s*\|.*\|\s*$/gm, " ")
    .replace(/^\s*(sources?|evidence|data sources?)\s*:.*$/gim, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chromium silently stops synthesis partway through long utterances
 * (roughly 15 s with its network voices) and never fires onend, which
 * left the status stuck on "speaking". Speaking sentence-sized chunks
 * in sequence avoids that. */
const MAX_CHUNK_CHARS = 220;

function splitIntoChunks(text: string): string[] {
  const sentences = text.match(/[^.!?।]+[.!?।]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + sentence).length > MAX_CHUNK_CHARS && current) {
      chunks.push(current.trim());
      current = "";
    }

    if (sentence.length > MAX_CHUNK_CHARS) {
      for (let i = 0; i < sentence.length; i += MAX_CHUNK_CHARS) {
        chunks.push(sentence.slice(i, i + MAX_CHUNK_CHARS).trim());
      }
      continue;
    }

    current += sentence;
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.filter(Boolean);
}

export function useVoiceOutput() {
  const [status, setStatus] = useState<VoiceOutputStatus>("idle");
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [usingFallbackVoice, setUsingFallbackVoice] = useState(false);

  // Identifies the active speak() call; events from a cancelled call
  // (which fire asynchronously after cancel()) are ignored.
  const sessionRef = useRef(0);
  // Holds the live utterances - Chromium can garbage-collect an
  // unreferenced utterance mid-speech and drop its onend.
  const utterancesRef = useRef<SpeechSynthesisUtterance[]>([]);

  const isSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const speak = useCallback(
    (text: string, options: { id?: string; language?: string } = {}) => {
      const speakable = toSpeakableText(text);

      if (!isSupported) {
        setStatus("unavailable");
        return;
      }

      if (!speakable) {
        return;
      }

      // A new reply always replaces the one being spoken - never two
      // answers overlapping or an old one finishing after a new ask.
      const session = ++sessionRef.current;
      window.speechSynthesis.cancel();

      const language = options.language ?? "en-IN";
      const match = selectVoice(language, speakable);

      // Honest: no voice on this device can read this script, so the
      // text stays on screen and the caller shows a notice.
      if (match.kind === "none") {
        utterancesRef.current = [];
        setStatus("unavailable");
        setSpeakingId(null);
        return;
      }

      setUsingFallbackVoice(match.kind === "fallback");

      const chunks = splitIntoChunks(speakable);
      const isCurrent = () => sessionRef.current === session;

      utterancesRef.current = chunks.map((chunk, index) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.lang = match.lang;
        if (match.voice) utterance.voice = match.voice;
        utterance.rate = 1;

        if (index === 0) {
          utterance.onstart = () => {
            if (!isCurrent()) return;
            setStatus("speaking");
            setSpeakingId(options.id ?? null);
          };
        }

        if (index === chunks.length - 1) {
          utterance.onend = () => {
            if (!isCurrent()) return;
            utterancesRef.current = [];
            setStatus("idle");
            setSpeakingId(null);
          };
        }

        utterance.onerror = (event) => {
          if (!isCurrent()) return;
          // Our own cancel()/stop() interrupting speech is not a
          // playback failure.
          if (event.error === "interrupted" || event.error === "canceled") {
            return;
          }
          sessionRef.current += 1;
          window.speechSynthesis.cancel();
          utterancesRef.current = [];
          setStatus(
            event.error === "language-unavailable" ||
              event.error === "voice-unavailable"
              ? "unavailable"
              : "error",
          );
          setSpeakingId(null);
        };

        return utterance;
      });

      for (const utterance of utterancesRef.current) {
        window.speechSynthesis.speak(utterance);
      }
    },
    [isSupported]
  );

  const pause = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.pause();
    setStatus("paused");
  }, [isSupported]);

  const resume = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.resume();
    setStatus("speaking");
  }, [isSupported]);

  const stop = useCallback(() => {
    if (!isSupported) return;
    sessionRef.current += 1;
    window.speechSynthesis.cancel();
    utterancesRef.current = [];
    setStatus("idle");
    setSpeakingId(null);
  }, [isSupported]);

  // Voices load asynchronously (Chrome fills the list after first
  // paint); listening keeps getVoices() warm so the next speak() sees
  // the real list instead of an empty one.
  useEffect(() => {
    if (!isSupported) return;
    const synth = window.speechSynthesis;
    const warm = () => synth.getVoices();
    warm();
    synth.addEventListener?.("voiceschanged", warm);
    return () => synth.removeEventListener?.("voiceschanged", warm);
  }, [isSupported]);

  useEffect(() => {
    return () => {
      if (isSupported) {
        sessionRef.current += 1;
        window.speechSynthesis.cancel();
      }
    };
  }, [isSupported]);

  return {
    status,
    speakingId,
    usingFallbackVoice,
    isSupported,
    speak,
    pause,
    resume,
    stop,
  };
}

export default useVoiceOutput;
