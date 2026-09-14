import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  askSagarBackend,
  type SagarChatResponse,
} from "../services/api/sagarApiClient";
import { askSagar as askSagarLocal } from "../services/ai/localSagar";
import { useAppStore } from "../store/appStore";
import { ROUTES } from "../constants/routes";

import type {
  ChatMapAction,
  ChatStructuredData,
} from "../components/chat/ChatStructuredPanel";
import type { RoutePlan } from "../types/route";

type SagarChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  route?: RoutePlan | null;
  structured?: ChatStructuredData;
  /** The language Sagar actually answered in (from the backend's detected
   * language), so voice playback can match the reply instead of a static
   * app-wide setting. */
  language?: string;
};

type SagarOptions = {
  language?: string;
  areaId?: string;
};

type UseSagarReturn = {
  messages: SagarChatMessage[];
  loading: boolean;
  error: string | null;
  sendMessage: (
    message: string,
    options?: SagarOptions
  ) => Promise<SagarChatMessage | null>;
  clearConversation: () => void;
  restoreMessages: (messages: SagarChatMessage[]) => void;
};

interface AssistantReply {
  text: string;
  route: RoutePlan | null;
  structured?: ChatStructuredData;
  language?: string;
}

/**
 * A small, result-relevant action set - never every possible action.
 * Map/route/zone navigation reuses the existing map handoff; "Simulate"
 * reuses the existing deterministic what-if pipeline by asking a real
 * follow-up question through the same Chat pipeline (no new engine).
 */
function buildStructuredActions(
  result: SagarChatResponse,
  handlers: { onView: () => void; onSimulate: () => void }
): ChatMapAction[] {
  const actions: ChatMapAction[] = [];

  const hasMapTarget = Boolean(
    result.route ||
      (result.zones && result.zones.length > 0) ||
      (result.alerts && result.alerts.length > 0) ||
      result.affectedArea
  );

  if (hasMapTarget) {
    const label = result.route
      ? "View route"
      : result.zones && result.zones.length > 0
        ? "View zone"
        : "View on map";

    actions.push({ label, onClick: handlers.onView });
  }

  // Only offer to simulate when there's a real risk baseline to compare
  // against and this answer isn't already a what-if comparison itself.
  const canSimulate =
    !result.whatIf &&
    typeof result.riskScore === "number" &&
    (result.intent === "safety" || result.intent === "route");

  if (canSimulate) {
    actions.push({ label: "Simulate (what if?)", onClick: handlers.onSimulate });
  }

  return actions.slice(0, 2);
}

function buildStructuredData(
  result: SagarChatResponse,
  handlers: { onView: () => void; onSimulate: () => void }
): ChatStructuredData | undefined {
  const actions = buildStructuredActions(result, handlers);

  const structured: ChatStructuredData = {
    riskLevel: result.riskLevel,
    riskScore: result.riskScore,
    keyFactors: result.keyFactors,
    evidenceTitles: result.evidence?.map((item) => item.title),
    whatIfSummary: result.whatIf
      ? `What if ${result.whatIf.question}? ${result.whatIf.impact}`
      : undefined,
    actions: actions.length > 0 ? actions : undefined,
  };

  const hasAnyField = Object.values(structured).some(
    (value) => value !== undefined && !(Array.isArray(value) && value.length === 0)
  );

  return hasAnyField ? structured : undefined;
}

export default function useSagar(): UseSagarReturn {
  const [messages, setMessages] = useState<SagarChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  const setPendingRoute = useAppStore(
    (state) => state.setPendingRoute
  );

  const setPendingMapFocus = useAppStore(
    (state) => state.setPendingMapFocus
  );

  const currentLocation = useAppStore(
    (state) => state.currentLocation
  );

  const selectedAreaId = useAppStore(
    (state) => state.selectedAreaId
  );

  // Lets a structured action (e.g. "Simulate") ask a real follow-up
  // question through this same hook's own sendMessage, without a
  // circular dependency between the two useCallbacks below.
  const sendMessageRef = useRef<UseSagarReturn["sendMessage"] | null>(null);

  const resolveAssistantReply = useCallback(
    async (
      text: string,
      options: SagarOptions,
      history: SagarChatMessage[]
    ): Promise<AssistantReply> => {
      const handleViewOnMap = (result: SagarChatResponse) => () => {
        if (result.route) {
          setPendingRoute(result.route);
          navigate(ROUTES.ROUTE);
          return;
        }

        setPendingMapFocus({
          areaId: result.affectedArea?.id,
          label: result.affectedArea?.name,
        });
        navigate(ROUTES.MAP);
      };

      const handleSimulate = () => {
        void sendMessageRef.current?.(
          "What if wind speed increases by 20%?",
          options
        );
      };

      try {
        const result = await askSagarBackend(text, {
          language: options.language,
          areaId: options.areaId ?? selectedAreaId ?? undefined,
          latitude: options.areaId
            ? undefined
            : currentLocation?.latitude,
          longitude: options.areaId
            ? undefined
            : currentLocation?.longitude,
          history: history.slice(-6).map((message) => ({
            role: message.role,
            text: message.text,
          })),
        });

        const base =
          result.answer ||
          result.recommendation ||
          (result.warnings && result.warnings.length > 0
            ? result.warnings.join(" ")
            : "Sagar could not generate a response for this request.");

        return {
          text: base,
          route: result.route ?? null,
          structured: buildStructuredData(result, {
            onView: handleViewOnMap(result),
            onSimulate: handleSimulate,
          }),
          language: result.language,
        };
      } catch (backendError) {
        console.warn(
          "Sagar backend is unavailable, using the offline responder:",
          backendError
        );

        const local = await askSagarLocal(text, {
          language: options.language,
          areaId: options.areaId,
        });

        return { text: local.text, route: null, language: options.language };
      }
    },
    [
      currentLocation?.latitude,
      currentLocation?.longitude,
      navigate,
      selectedAreaId,
      setPendingMapFocus,
      setPendingRoute,
    ]
  );

  const sendMessage = useCallback(
    async (
      message: string,
      options: SagarOptions = {}
    ) => {
      const text = message.trim();

      if (!text || loading) {
        return null;
      }

      setError(null);

      const userMessage: SagarChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        text,
        timestamp: new Date().toISOString(),
      };

      const historySnapshot = [...messages, userMessage];

      setMessages((current) => [
        ...current,
        userMessage,
      ]);

      setLoading(true);

      try {
        const reply = await resolveAssistantReply(
          text,
          options,
          historySnapshot
        );

        const assistantMessage: SagarChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: reply.text,
          timestamp: new Date().toISOString(),
          route: reply.route,
          structured: reply.structured,
          language: reply.language,
        };

        setMessages((current) => [
          ...current,
          assistantMessage,
        ]);

        return assistantMessage;
      } catch (err) {
        console.error(
          "Sagar request failed:",
          err
        );

        setError(
          "Sagar could not process the request."
        );

        return null;
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, resolveAssistantReply]
  );

  sendMessageRef.current = sendMessage;

  const clearConversation = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const restoreMessages = useCallback(
    (restored: SagarChatMessage[]) => {
      setMessages(restored);
      setError(null);
    },
    []
  );

  return {
    messages,
    loading,
    error,
    sendMessage,
    clearConversation,
    restoreMessages,
  };
}
