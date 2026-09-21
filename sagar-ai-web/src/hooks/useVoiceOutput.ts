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

export function useVoiceOutput() {
  const [status, setStatus] = useState<VoiceOutputStatus>("idle");
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const isSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const speak = useCallback(
    (text: string, options: { id?: string; language?: string } = {}) => {
      if (!isSupported || !text.trim()) {
        setStatus("error");
        return;
      }

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

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;
      utterance.rate = 1;

      utterance.onstart = () => {
        setStatus("speaking");
        setSpeakingId(options.id ?? null);
      };

      utterance.onend = () => {
        setStatus("idle");
        setSpeakingId(null);
      };

      utterance.onerror = () => {
        setStatus("error");
        setSpeakingId(null);
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
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
    window.speechSynthesis.cancel();
    setStatus("idle");
    setSpeakingId(null);
  }, [isSupported]);

  useEffect(() => {
    return () => {
      if (isSupported) {
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
