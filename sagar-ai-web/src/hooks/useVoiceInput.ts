import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceInputStatus = "idle" | "listening" | "error";

export type VoiceInputErrorReason =
  | "denied"
  | "no-speech"
  | "unsupported"
  | "network"
  | "unknown";

interface UseVoiceInputOptions {
  /** BCP-47 locale, e.g. "en-IN", "ta-IN". */
  language?: string;
  onResult: (transcript: string) => void;
}

function getSpeechRecognitionCtor(): (new () => any) | null {
  if (typeof window === "undefined") {
    return null;
  }

  const w = window as unknown as {
    SpeechRecognition?: new () => any;
    webkitSpeechRecognition?: new () => any;
  };

  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useVoiceInput({
  language = "en-IN",
  onResult,
}: UseVoiceInputOptions) {
  const [status, setStatus] = useState<VoiceInputStatus>("idle");
  const [errorReason, setErrorReason] =
    useState<VoiceInputErrorReason | null>(null);

  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const isSupported = getSpeechRecognitionCtor() !== null;

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();

    if (!Ctor) {
      setStatus("error");
      setErrorReason("unsupported");
      return;
    }

    recognitionRef.current?.abort?.();

    const recognition = new Ctor();
    recognition.lang = language;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setStatus("listening");
      setErrorReason(null);
    };

    recognition.onresult = (event: any) => {
      const transcript = event?.results?.[0]?.[0]?.transcript;

      if (typeof transcript === "string" && transcript.trim()) {
        onResultRef.current(transcript.trim());
      }

      setStatus("idle");
    };

    recognition.onerror = (event: any) => {
      let reason: VoiceInputErrorReason = "unknown";

      if (
        event?.error === "not-allowed" ||
        event?.error === "service-not-allowed"
      ) {
        reason = "denied";
      } else if (event?.error === "no-speech") {
        reason = "no-speech";
      } else if (event?.error === "network") {
        reason = "network";
      }

      setStatus("error");
      setErrorReason(reason);
    };

    recognition.onend = () => {
      setStatus((current) =>
        current === "listening" ? "idle" : current
      );
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setStatus("error");
      setErrorReason("unknown");
    }
  }, [language]);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop?.();
    } catch {
      // Ignore - recognition may already be stopped.
    }
    setStatus("idle");
  }, []);

  const cancel = useCallback(() => {
    try {
      recognitionRef.current?.abort?.();
    } catch {
      // Ignore.
    }
    setStatus("idle");
    setErrorReason(null);
  }, []);

  const retry = useCallback(() => {
    setErrorReason(null);
    start();
  }, [start]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort?.();
      } catch {
        // Ignore on unmount.
      }
    };
  }, []);

  return {
    status,
    errorReason,
    isSupported,
    start,
    stop,
    cancel,
    retry,
  };
}

export default useVoiceInput;
