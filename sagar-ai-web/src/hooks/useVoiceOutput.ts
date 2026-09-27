import { useCallback, useEffect, useRef, useState } from "react";

import { splitSentences, toSpokenSummary } from "../utils/speechText";

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
    [...list].sort(
      (a, b) =>
        Number(b.localService) - Number(a.localService) ||
        Number(b.default) - Number(a.default) ||
        a.name.localeCompare(b.name),
    )[0];

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
      voices.filter((voice) => normLang(voice.lang) === "en-in").length > 0
        ? voices.filter((voice) => normLang(voice.lang) === "en-in")
        : voices.filter((voice) => normLang(voice.lang).startsWith("en"));
    if (english.length) {
      const voice = byPreference(english);
      return { kind: "fallback", voice, lang: voice.lang };
    }
  }

  return { kind: "none" };
}

/** Chromium silently stops synthesis partway through long utterances
 * (roughly 15 s with its network voices) and never fires onend, which
 * left the status stuck on "speaking". Speaking sentence-sized chunks
 * in sequence avoids that. */
const MAX_CHUNK_CHARS = 220;

function splitIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const sentence of splitSentences(text)) {
    if (current && (current + " " + sentence).length > MAX_CHUNK_CHARS) {
      chunks.push(current);
      current = "";
    }

    if (sentence.length > MAX_CHUNK_CHARS) {
      // Break an over-long sentence at word boundaries, never mid-word
      // or mid-number.
      let piece = "";
      for (const word of sentence.split(" ")) {
        if (piece && (piece + " " + word).length > MAX_CHUNK_CHARS) {
          chunks.push(piece);
          piece = "";
        }
        piece = piece ? `${piece} ${word}` : word;
      }
      if (piece) chunks.push(piece);
      continue;
    }

    current = current ? `${current} ${sentence}` : sentence;
  }

  if (current) chunks.push(current);
  return chunks;
}

/*
 * One consistent Sagar voice: the first voice chosen for a locale is
 * pinned for the rest of the session (while the device still offers
 * it), so replies never hop between voices as the browser's voice list
 * loads or reorders.
 */
const pinnedVoices = new Map<string, string>();

function pinVoice(locale: string, match: VoiceMatch, voices: SpeechSynthesisVoice[]): VoiceMatch {
  if (match.kind === "none" || !match.voice) return match;

  const key = `${locale}:${match.kind}`;
  const pinned = voices.find((voice) => voice.voiceURI === pinnedVoices.get(key));

  if (pinned) {
    return match.kind === "native"
      ? { kind: "native", voice: pinned, lang: pinned.lang }
      : { kind: "fallback", voice: pinned, lang: pinned.lang };
  }

  pinnedVoices.set(key, match.voice.voiceURI);
  return match;
}

/** A second speak() of the same reply this soon is a double-trigger. */
const DUPLICATE_SPEECH_MS = 1500;

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
  const lastSpokenRef = useRef<{ key: string; at: number } | null>(null);

  const isSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const speak = useCallback(
    (text: string, options: { id?: string; language?: string } = {}) => {
      if (!isSupported) {
        setStatus("unavailable");
        return;
      }

      const language = options.language ?? "en-IN";
      const voices = window.speechSynthesis.getVoices();
      const match = pinVoice(language, selectVoice(language, text, voices), voices);
      // Units are spelled out for the voice that will actually read it
      // (an English fallback voice reading Tanglish gets "metres").
      const speakable = toSpokenSummary(text, match.kind === "none" ? language : match.lang);

      if (!speakable) {
        return;
      }

      const now = Date.now();
      const last = lastSpokenRef.current;
      if (
        last &&
        last.key === `${options.id ?? ""}|${speakable}` &&
        now - last.at < DUPLICATE_SPEECH_MS &&
        window.speechSynthesis.speaking
      ) {
        return;
      }
      lastSpokenRef.current = { key: `${options.id ?? ""}|${speakable}`, at: now };

      // A new reply always replaces the one being spoken - never two
      // answers overlapping or an old one finishing after a new ask.
      const session = ++sessionRef.current;
      window.speechSynthesis.cancel();

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

  // Only move between speaking and paused - never report "speaking"
  // when nothing is queued (e.g. resume after speech already ended).
  const pause = useCallback(() => {
    if (!isSupported || !window.speechSynthesis.speaking) return;
    window.speechSynthesis.pause();
    setStatus((current) => (current === "speaking" ? "paused" : current));
  }, [isSupported]);

  const resume = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.resume();
    setStatus((current) => (current === "paused" ? "speaking" : current));
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
