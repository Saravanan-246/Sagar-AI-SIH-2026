import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceOutputStatus = "idle" | "speaking" | "paused" | "error";

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

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = options.language ?? "en-IN";
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
