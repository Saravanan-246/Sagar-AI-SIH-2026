import { useCallback, useEffect, useRef, useState } from "react";

import {
  getSpeechRecognitionCtor,
  getVoiceCapabilities,
  queryMicrophonePermission,
  watchMicrophonePermission,
  type MicPermissionState,
  type VoiceCapabilities,
} from "../utils/voiceCapabilities";

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

/**
 * Why voice input can't run - each maps to its own message, so a user is
 * never told to grant a permission when that isn't the problem.
 *
 * - insecure: page isn't https/localhost; the browser won't expose the mic
 * - unsupported: no SpeechRecognition in this browser
 * - mic-unsupported: the browser exposes no microphone API at all
 * - denied: the permission prompt was refused or dismissed
 * - blocked: microphone permanently blocked for this site (site settings)
 * - audio-capture: no working microphone (missing, or in use elsewhere)
 * - service: the speech recognition service refused or is disabled
 * - network: the recognition service could not be reached
 * - language: the recognizer doesn't support the selected language
 * - no-speech / unknown: temporary - just try again
 */
export type VoiceInputErrorReason =
  | "insecure"
  | "unsupported"
  | "mic-unsupported"
  | "denied"
  | "blocked"
  | "audio-capture"
  | "service"
  | "network"
  | "language"
  | "no-speech"
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
    case "mic-unsupported":
    case "service":
    case "language":
      return "VOICE_UNAVAILABLE";
    case "denied":
    case "blocked":
      return "MICROPHONE_PERMISSION_REQUIRED";
    default:
      return "VOICE_INPUT_FAILED";
  }
}

/** Whether tapping Retry can succeed without changing browser, URL or
 * voice language - false for the capability gaps. */
export function isRetryableVoiceError(reason: VoiceInputErrorReason | null): boolean {
  switch (reason) {
    case "insecure":
    case "unsupported":
    case "mic-unsupported":
    case "service":
    case "language":
      return false;
    default:
      return true;
  }
}

/**
 * Maps a SpeechRecognition error code to the real cause. "not-allowed"
 * alone can mean an insecure page, a refused prompt, a mic blocked in
 * site settings, or a recognizer refusing despite a granted mic - the
 * capabilities and permission state tell them apart.
 */
export function classifyRecognitionError(
  code: string | undefined,
  capabilities: VoiceCapabilities,
  permission: MicPermissionState,
): VoiceInputErrorReason {
  switch (code) {
    case "not-allowed":
      if (!capabilities.secureContext) return "insecure";
      if (permission === "denied") return "blocked";
      if (permission === "granted") return "service";
      return capabilities.microphoneApi ? "denied" : "mic-unsupported";
    case "service-not-allowed":
      return capabilities.secureContext ? "service" : "insecure";
    case "audio-capture":
      return capabilities.microphoneApi ? "audio-capture" : "mic-unsupported";
    case "network":
      return "network";
    case "language-not-supported":
      return "language";
    case "no-speech":
      return "no-speech";
    default:
      return "unknown";
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

/** A transcript worth sending: has at least one letter in any script
 * and is not just recognizer noise ("uh", "hmm", punctuation). */
export function isUsableTranscript(transcript: string): boolean {
  const text = transcript.trim();
  if (!/\p{L}/u.test(text)) return false;
  return !/^(u+h+|u+m+|h+m+|a+h+|e+r+)[.!?]*$/i.test(text);
}

/** Some engines (notably Chrome on Android) report the same final
 * phrase more than once; a repeat inside this window is dropped. */
const DUPLICATE_WINDOW_MS = 2500;

export type DeliveredTranscript = { text: string; at: number };

/** Whether a final transcript should be sent to Sagar, given the last
 * one that was. */
export function shouldDeliverTranscript(
  text: string,
  last: DeliveredTranscript | null,
  now: number,
): boolean {
  if (!isUsableTranscript(text)) return false;
  return !(
    last !== null &&
    last.text.toLowerCase() === text.toLowerCase() &&
    now - last.at < DUPLICATE_WINDOW_MS
  );
}

/**
 * Known before any attempt. A browser without SpeechRecognition can't
 * be fixed by https, so that is checked first. Browsers only grant
 * microphone access on a secure origin (https or localhost); on plain
 * http - e.g. a phone opening the dev server by LAN IP - the recognizer
 * may still exist but every start() fails with "not-allowed", which
 * would otherwise be misreported as the user having blocked the mic.
 */
function unavailableReason(): VoiceInputErrorReason | null {
  const capabilities = getVoiceCapabilities();

  if (!capabilities.speechRecognition) {
    return "unsupported";
  }

  if (!capabilities.secureContext) {
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
  const lastDeliveredRef = useRef<DeliveredTranscript | null>(null);
  // Kept current (never prompts) so a "not-allowed" can be told apart:
  // refused prompt vs blocked in site settings vs recognizer refusal.
  const micPermissionRef = useRef<MicPermissionState>("unknown");

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(
    () =>
      watchMicrophonePermission((state) => {
        micPermissionRef.current = state;
      }),
    [],
  );

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
    // One recognition session hands over at most one final transcript.
    let delivered = false;

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

      if (!finalTranscript.trim()) {
        if (!delivered) setInterimTranscript(interim);
        return;
      }

      if (delivered) return;
      delivered = true;
      setInterimTranscript("");

      const text = finalTranscript.trim().replace(/\s+/g, " ");
      const now = Date.now();

      if (!shouldDeliverTranscript(text, lastDeliveredRef.current, now)) {
        // Nothing worth sending - end quietly, as if nothing was heard.
        setStatus("idle");
        return;
      }

      lastDeliveredRef.current = { text, at: now };
      setStatus("ready");
      onResultRef.current(text);
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

      const reason = classifyRecognitionError(
        code,
        getVoiceCapabilities(),
        micPermissionRef.current,
      );

      if (import.meta.env.DEV) {
        console.warn(
          `[sagar-voice] Recognition error "${code}" -> ${reason} (mic permission: ${micPermissionRef.current})`,
        );
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
    } catch (error) {
      detach(recognition);
      recognitionRef.current = null;
      setStatus("error");
      // Some engines refuse synchronously instead of via onerror.
      setErrorReason(
        error instanceof Error && error.name === "NotAllowedError"
          ? classifyRecognitionError("not-allowed", getVoiceCapabilities(), micPermissionRef.current)
          : "unknown",
      );
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

  /** Re-runs initialization from scratch: capabilities are re-detected
   * by start(), and the permission is re-read in case the user just
   * changed it in site settings. start() itself stays synchronous so
   * the tap's user activation is still valid when it asks for the mic. */
  const retry = useCallback(() => {
    setErrorReason(null);
    void queryMicrophonePermission().then((state) => {
      micPermissionRef.current = state;
    });
    start();
  }, [start]);

  useEffect(() => discardCurrent, [discardCurrent]);

  const activeError = status === "error" ? errorReason : null;

  return {
    status,
    errorReason,
    errorCode: voiceErrorCode(activeError),
    /** False when Retry can't help (wrong browser, http page, …). */
    retryable: activeError !== null && isRetryableVoiceError(activeError),
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
