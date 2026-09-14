import { useCallback, useState } from "react";

import { askSagarBackend } from "../services/api/sagarApiClient";
import { askSagar as askSagarLocal } from "../services/ai/localSagar";
import { useAppStore } from "../store/appStore";

import type { RoutePlan } from "../types/route";

type SagarChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  route?: RoutePlan | null;
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
}

async function resolveAssistantReply(
  text: string,
  options: SagarOptions
): Promise<AssistantReply> {
  try {
    const result = await askSagarBackend(text, {
      language: options.language,
      areaId: options.areaId,
    });

    const base =
      result.answer ||
      result.recommendation ||
      (result.warnings && result.warnings.length > 0
        ? result.warnings.join(" ")
        : "Sagar could not generate a response for this request.");

    const replyText = result.whatIf
      ? [
          base,
          "",
          `What if ${result.whatIf.question}?`,
          result.whatIf.impact,
          `Recommendation: ${result.whatIf.recommendation}`,
        ].join("\n")
      : base;

    return { text: replyText, route: result.route ?? null };
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
}

export default function useSagar(): UseSagarReturn {
  const [messages, setMessages] = useState<SagarChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setPendingRoute = useAppStore(
    (state) => state.setPendingRoute
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

      setMessages((current) => [
        ...current,
        userMessage,
      ]);

      setLoading(true);

      try {
        const reply = await resolveAssistantReply(
          text,
          options
        );

        if (reply.route) {
          setPendingRoute(reply.route);
        }

        const assistantMessage: SagarChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: reply.text,
          timestamp: new Date().toISOString(),
          route: reply.route,
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
    [loading, setPendingRoute]
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
