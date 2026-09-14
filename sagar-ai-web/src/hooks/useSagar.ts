import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  askSagarBackend,
  type SagarChatResponse,
} from "../services/api/sagarApiClient";
import { askSagar as askSagarLocal } from "../services/ai/localSagar";
import { useAppStore } from "../store/appStore";
import { ROUTES } from "../constants/routes";

import type { ChatStructuredData } from "../components/chat/ChatStructuredPanel";
import type { RoutePlan } from "../types/route";

type SagarChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  route?: RoutePlan | null;
  structured?: ChatStructuredData;
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
};

interface AssistantReply {
  text: string;
  route: RoutePlan | null;
  structured?: ChatStructuredData;
}

function buildStructuredData(
  result: SagarChatResponse,
  onViewMap: () => void
): ChatStructuredData | undefined {
  const hasMapTarget = Boolean(
    result.route ||
      (result.zones && result.zones.length > 0) ||
      (result.alerts && result.alerts.length > 0) ||
      result.affectedArea
  );

  const structured: ChatStructuredData = {
    riskLevel: result.riskLevel,
    riskScore: result.riskScore,
    keyFactors: result.keyFactors,
    evidenceTitles: result.evidence?.map((item) => item.title),
    whatIfSummary: result.whatIf
      ? `What if ${result.whatIf.question}? ${result.whatIf.impact}`
      : undefined,
    mapAction: hasMapTarget
      ? {
          label: result.route ? "View route on map" : "View on map",
          onClick: onViewMap,
        }
      : undefined,
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
          structured: buildStructuredData(
            result,
            handleViewOnMap(result)
          ),
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

        return { text: local.text, route: null };
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

  const clearConversation = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    loading,
    error,
    sendMessage,
    clearConversation,
  };
}
