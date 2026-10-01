/**
 * What this browser, on this origin, can actually do for voice input -
 * detected from the real APIs, never assumed. Shared by useVoiceInput
 * (to explain a failure accurately) and the dev diagnostics panel.
 */

export interface VoiceCapabilities {
  /** https or localhost. Browsers expose the microphone only here. */
  secureContext: boolean;
  /** SpeechRecognition / webkitSpeechRecognition exists. */
  speechRecognition: boolean;
  /** navigator.mediaDevices.getUserMedia exists (hidden on insecure origins). */
  microphoneApi: boolean;
}

export type MicPermissionState = "granted" | "denied" | "prompt" | "unknown";

type SpeechRecognitionCtor = new () => any;

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") {
    return null;
  }

  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };

  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function getVoiceCapabilities(): VoiceCapabilities {
  if (typeof window === "undefined") {
    return { secureContext: false, speechRecognition: false, microphoneApi: false };
  }

  return {
    secureContext:
      typeof window.isSecureContext === "boolean"
        ? window.isSecureContext
        : window.location.protocol === "https:",
    speechRecognition: getSpeechRecognitionCtor() !== null,
    microphoneApi: typeof navigator.mediaDevices?.getUserMedia === "function",
  };
}

async function queryPermissionStatus(): Promise<PermissionStatus | null> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return null;
  }

  try {
    // "microphone" is missing from older TS lib PermissionName unions.
    return await navigator.permissions.query({ name: "microphone" as PermissionName });
  } catch {
    // Browsers that don't know the "microphone" permission name throw.
    return null;
  }
}

function toMicPermission(status: PermissionStatus | null): MicPermissionState {
  const state = status?.state;
  return state === "granted" || state === "denied" || state === "prompt" ? state : "unknown";
}

/** Current microphone permission, without ever prompting the user. */
export async function queryMicrophonePermission(): Promise<MicPermissionState> {
  return toMicPermission(await queryPermissionStatus());
}

/** Calls onChange with the permission now and whenever it changes (e.g.
 * the user allows the mic in site settings). Returns an unsubscribe. */
export function watchMicrophonePermission(
  onChange: (state: MicPermissionState) => void
): () => void {
  let active = true;
  let status: PermissionStatus | null = null;
  const handleChange = () => {
    if (active) onChange(toMicPermission(status));
  };

  void queryPermissionStatus().then((result) => {
    if (!active) return;
    status = result;
    onChange(toMicPermission(result));
    result?.addEventListener("change", handleChange);
  });

  return () => {
    active = false;
    status?.removeEventListener("change", handleChange);
  };
}
