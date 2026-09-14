import type { ReactNode } from "react";

type ChatMessageProps = {
  role: "user" | "assistant";
  children: ReactNode;
  timestamp?: string;
};

export default function ChatMessage({
  role,
  children,
  timestamp,
}: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div
      className={`chat-message-row ${
        isUser ? "chat-message-row-user" : "chat-message-row-assistant"
      }`}
    >
      {!isUser && (
        <div className="chat-avatar" aria-hidden="true">
          S
        </div>
      )}

      <div
        className={`chat-message-content ${
          isUser
            ? "chat-message-content-user"
            : "chat-message-content-assistant"
        }`}
      >
        <div
          className={`chat-bubble ${
            isUser ? "chat-bubble-user" : "chat-bubble-assistant"
          }`}
        >
          <div className="chat-bubble-text">{children}</div>
        </div>

        {timestamp && (
          <span
            className={`chat-message-time ${
              isUser
                ? "chat-message-time-user"
                : "chat-message-time-assistant"
            }`}
          >
            {timestamp}
          </span>
        )}
      </div>
    </div>
  );
}