import { useEffect, useRef, type ReactNode } from "react";

import ChatMessage from "./ChatMessage";
import ChatWelcome from "./ChatWelcome";
import ThinkingState from "./ThinkingState";
import type { ChatStructuredData } from "./ChatStructuredPanel";

export type ChatItem = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp?: string;
  structured?: ChatStructuredData;
};

type ChatWindowProps = {
  messages: ChatItem[];
  loading?: boolean;
  onSuggestion?: (value: string) => void;
  renderVoiceControl?: (message: ChatItem) => ReactNode;
};

export default function ChatWindow({
  messages,
  loading = false,
  onSuggestion,
  renderVoiceControl,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, loading]);

  const isEmpty = messages.length === 0;

  return (
    <div className="chat-window">
      <div className="chat-window-scroll">
        <div className="chat-window-content">
          {isEmpty ? (
            <ChatWelcome
              onSuggestion={onSuggestion}
            />
          ) : (
            <div className="chat-message-list">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  role={message.role}
                  timestamp={message.timestamp}
                  structured={message.structured}
                  voiceControl={renderVoiceControl?.(message)}
                >
                  {message.text}
                </ChatMessage>
              ))}

              {loading && <ThinkingState />}
            </div>
          )}

          <div
            ref={bottomRef}
            className="chat-scroll-anchor"
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}
