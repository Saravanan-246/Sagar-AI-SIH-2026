import { useCallback, useState } from "react";

import { askSagar } from "../services/ai/localSagar";

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
        const result = await askSagar(text, {
          language: options.language,
          areaId: options.areaId,
        });

        const assistantText =
          typeof result === "string"
            ? result
            : result.text;

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