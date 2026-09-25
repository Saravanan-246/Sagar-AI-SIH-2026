import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceOutputStatus = "idle" | "speaking" | "paused" | "error" | "unavailable";

/** Whether the browser has registered ANY voice whose lang matches the
 * requested one, by primary subtag (e.g. "ta" matches "ta-IN"). Voices
 * load asynchronously in some browsers, so an empty list here can mean
 * "not loaded yet" as well as "genuinely none" - callers treat this as
 * a best-effort check, not a hard guarantee, and still let speak()
 * attempt synthesis regardless (onerror is the authoritative signal). */
function hasVoiceFor(language: string): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return false;
  }

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) {
    // Voice list not loaded yet on this browser - don't claim
    // "unavailable" from an empty list that's simply not ready.
    return true;
  }

  const primary = language.split("-")[0]?.toLowerCase();
  return voices.some((voice) => voice.lang.toLowerCase().startsWith(primary ?? ""));
}

/** Markdown markers would otherwise be read out literally
 * ("asterisk asterisk…"). Only strips syntax - never words. */
function toSpeakableText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
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

      const session = ++sessionRef.current;
      window.speechSynthesis.cancel();

      const language = options.language ?? "en-IN";

      // A real, honest check - never silently attempts to speak Tamil
      // with the browser's only (English) voice and pretend it worked.
      // Text stays available regardless; this only governs whether we
      // attempt audio.
      if (!hasVoiceFor(language)) {
        setStatus("unavailable");
        setSpeakingId(null);
        return;
      }

      const chunks = splitIntoChunks(speakable);
      const isCurrent = () => sessionRef.current === session;

      utterancesRef.current = chunks.map((chunk, index) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.lang = language;
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
    isSupported,
    speak,
    pause,
    resume,
    stop,
  };
}

export default useVoiceOutput;
