import { useCallback, useEffect, useRef, useState } from "react";

/**
 * idle -> listening -> processing -> ready -> idle, driven only by the
 * browser recognizer's own events (onstart / onspeechend / final
 * onresult / onend) - never a timer or a guessed transition.
 * "ready" means a final transcript was captured and handed to the
 * caller; it resolves back to idle when the recognizer ends.
 */
export type VoiceInputStatus =
  | "idle"
  | "listening"
  | "processing"
  | "ready"
  | "error";

export type VoiceInputErrorReason =
  | "denied"
  | "no-speech"
  | "unsupported"
  | "insecure"
  | "audio-capture"
  | "network"
  | "unknown";

/** Coarse, UI-facing classification of a voice failure. */
export type VoiceInputErrorCode =
  | "VOICE_UNAVAILABLE"
  | "MICROPHONE_PERMISSION_REQUIRED"
  | "VOICE_INPUT_FAILED";

export function voiceErrorCode(
  reason: VoiceInputErrorReason | null,
): VoiceInputErrorCode | null {
  switch (reason) {
    case null:
      return null;
    case "unsupported":
    case "insecure":
      return "VOICE_UNAVAILABLE";
    case "denied":
    case "audio-capture":
      return "MICROPHONE_PERMISSION_REQUIRED";
    default:
      return "VOICE_INPUT_FAILED";
  }
}

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

/**
 * Browsers only grant microphone access on a secure origin (https or
 * localhost). On plain http - e.g. testing the dev server from a phone
 * via a LAN IP - the recognizer still exists but every start() fails
 * with "not-allowed", which would otherwise be misreported as the user
 * having blocked the mic.
 */
function unavailableReason(): VoiceInputErrorReason | null {
  if (!getSpeechRecognitionCtor()) {
    return "unsupported";
  }

  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return "insecure";
  }

  return null;
}

/** Detaches every handler so a recognizer we are discarding can never
 * push its late events (notably the "aborted" error and onend that
 * abort() itself triggers) into the state of the next session. */
function detach(recognition: any) {
  if (!recognition) return;
  recognition.onstart = null;
  recognition.onresult = null;
  recognition.onspeechend = null;
  recognition.onerror = null;
  recognition.onend = null;
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

  const blockedReason = unavailableReason();
  const isSupported = blockedReason === null;

  const discardCurrent = useCallback(() => {
    const current = recognitionRef.current;
    recognitionRef.current = null;

    if (!current) return;

    detach(current);
    try {
      current.abort?.();
    } catch {
      // Already stopped.
    }
  }, []);

  const start = useCallback(() => {
    const blocked = unavailableReason();

    if (blocked) {
      setStatus("error");
      setErrorReason(blocked);
      return;
    }

    const Ctor = getSpeechRecognitionCtor()!;

    // Only one recognizer may own the microphone at a time.
    discardCurrent();

    const recognition = new Ctor();
    recognition.lang = language;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    // Every handler checks it still belongs to the active session.
    const isCurrent = () => recognitionRef.current === recognition;

    recognition.onstart = () => {
      if (!isCurrent()) return;
      setStatus("listening");
      setErrorReason(null);
      setInterimTranscript("");
    };

    recognition.onresult = (event: any) => {
      if (!isCurrent()) return;

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
        setStatus("ready");
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
      if (!isCurrent()) return;
      setStatus((current) => (current === "listening" ? "processing" : current));
    };

    recognition.onerror = (event: any) => {
      if (!isCurrent()) return;

      const code = event?.error;

      // "aborted" is only ever the result of our own abort() call - not
      // a failure the user needs to hear about.
      if (code === "aborted") {
        return;
      }

      let reason: VoiceInputErrorReason = "unknown";

      if (code === "not-allowed" || code === "service-not-allowed") {
        reason = window.isSecureContext === false ? "insecure" : "denied";
      } else if (code === "no-speech") {
        reason = "no-speech";
      } else if (code === "audio-capture") {
        reason = "audio-capture";
      } else if (code === "network") {
        reason = "network";
      } else if (code === "language-not-supported") {
        reason = "unsupported";
      }

      setInterimTranscript("");
      setStatus("error");
      setErrorReason(reason);
    };

    recognition.onend = () => {
      if (!isCurrent()) return;
      recognitionRef.current = null;
      // Always resolves back to idle from any in-progress state - never
      // leaves the UI stuck showing "Listening…"/"Processing…" if the
      // engine ends without ever firing a result or error.
      setInterimTranscript("");
      setStatus((current) => (current === "error" ? current : "idle"));
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      detach(recognition);
      recognitionRef.current = null;
      setStatus("error");
      setErrorReason("unknown");
    }
  }, [language, discardCurrent]);

  /** Stop listening but keep what was heard: the recognizer still
   * delivers its final result for the audio so far, then ends - so the
   * honest state until then is "processing", not "idle". */
  const stop = useCallback(() => {
    const current = recognitionRef.current;

    if (!current) {
      setInterimTranscript("");
      setStatus((s) => (s === "error" ? s : "idle"));
      return;
    }

    try {
      current.stop?.();
      setStatus((s) => (s === "listening" ? "processing" : s));
    } catch {
      discardCurrent();
      setInterimTranscript("");
      setStatus("idle");
    }
  }, [discardCurrent]);

  /** Abandon the session and discard anything heard. */
  const cancel = useCallback(() => {
    discardCurrent();
    setInterimTranscript("");
    setStatus("idle");
    setErrorReason(null);
  }, [discardCurrent]);

  const retry = useCallback(() => {
    setErrorReason(null);
    start();
  }, [start]);

  useEffect(() => discardCurrent, [discardCurrent]);

  return {
    status,
    errorReason,
    errorCode: voiceErrorCode(status === "error" ? errorReason : null),
    unavailableReason: blockedReason,
    interimTranscript,
    isSupported,
    start,
    stop,
    cancel,
    retry,
  };
}

export default useVoiceInput;
