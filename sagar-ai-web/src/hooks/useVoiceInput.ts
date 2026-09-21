import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceInputStatus = "idle" | "listening" | "processing" | "error";

export type VoiceInputErrorReason =
  | "denied"
  | "no-speech"
  | "unsupported"
  | "network"
  | "unknown";

interface UseVoiceInputOptions {
  /** BCP-47 locale, e.g. "en-IN", "ta-IN". This is a real requirement
   * of the browser's SpeechRecognition API, not an optional hint - the
   * API has no "detect any language from raw audio" mode, so it must
   * be told what to expect before listening starts. The caller is
   * expected to pass the best currently-known language (e.g. the
   * conversation's own rolling detected language), not a hardcoded
   * default, so this comes as close to "automatic" as the real API
   * allows without pretending it's universal. */
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
  // The real, live-updating interim recognition result while the user
  // is still speaking (SpeechRecognition's own non-final hypothesis) -
  // never guessed or synthesized. Cleared once a final result or an
  // error/end arrives.
  const [interimTranscript, setInterimTranscript] = useState("");

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
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setStatus("listening");
      setErrorReason(null);
      setInterimTranscript("");
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      let interim = "";

      for (let i = event.resultIndex ?? 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript ?? "";

        if (result.isFinal) {
          finalTranscript += transcript;
        } else {
          interim += transcript;
        }
      }

      if (finalTranscript.trim()) {
        setInterimTranscript("");
        onResultRef.current(finalTranscript.trim());
      } else {
        setInterimTranscript(interim);
      }
    };

    // Fires once the API detects the user has stopped talking, before
    // the final transcript is ready - a real, distinct signal from the
    // browser (not fabricated) for a genuine "still processing what
    // you said" moment between listening and the result arriving.
    recognition.onspeechend = () => {
      setStatus((current) => (current === "listening" ? "processing" : current));
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

      setInterimTranscript("");
      setStatus("error");
      setErrorReason(reason);
    };

    recognition.onend = () => {
      // Always resolves back to idle from any in-progress state - never
      // leaves the UI stuck showing "Listening…"/"Processing…" if the
      // engine ends without ever firing a result or error.
      setInterimTranscript("");
      setStatus((current) =>
        current === "listening" || current === "processing" ? "idle" : current
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
    setInterimTranscript("");
    setStatus("idle");
  }, []);

  const cancel = useCallback(() => {
    try {
      recognitionRef.current?.abort?.();
    } catch {
      // Ignore.
    }
    setInterimTranscript("");
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
    interimTranscript,
    isSupported,
    start,
    stop,
    cancel,
    retry,
  };
}

export default useVoiceInput;
