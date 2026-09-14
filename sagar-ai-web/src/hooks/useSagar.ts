import { useCallback, useState } from "react";

import { askSagarBackend } from "../services/api/sagarApiClient";
import { askSagar as askSagarLocal } from "../services/ai/localSagar";

type SagarChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
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

async function resolveAssistantText(
  text: string,
  options: SagarOptions
): Promise<string> {
  try {
    const result = await askSagarBackend(text, {
      language: options.language,
      areaId: options.areaId,
    });

    if (result.finalResponse) {
      return result.finalResponse;
    }

    if (result.finalRecommendation) {
      return result.finalRecommendation;
    }

    if (result.warnings && result.warnings.length > 0) {
      return result.warnings.join(" ");
    }

    return "Sagar could not generate a response for this request.";
  } catch (backendError) {
    console.warn(
      "Sagar backend is unavailable, using the offline responder:",
      backendError
    );

    const local = await askSagarLocal(text, {
      language: options.language,
      areaId: options.areaId,
    });

    return local.text;
  }
}

export default function useSagar(): UseSagarReturn {
  const [messages, setMessages] = useState<SagarChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const assistantText = await resolveAssistantText(
          text,
          options
        );

        const assistantMessage: SagarChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: assistantText,
          timestamp: new Date().toISOString(),
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
    [loading]
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
