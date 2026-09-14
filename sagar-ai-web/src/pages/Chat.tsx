import { useState } from "react";
import {
  ArrowLeft,
  Bot,
  MessageCircle,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import Button from "../components/ui/Button";
import ChatInput from "../components/chat/ChatInput";
import ChatWindow from "../components/chat/ChatWindow";
import type { ChatItem } from "../components/chat/ChatWindow";
import useSagar from "../hooks/useSagar";
import { ROUTES } from "../constants/routes";

import "./Chat.css";

export default function Chat() {
  const navigate = useNavigate();

  const {
    messages,
    loading,
    error,
    sendMessage,
    clearConversation,
  } = useSagar();

  const [input, setInput] = useState("");

  const chatMessages: ChatItem[] = messages.map(
    (message) => ({
      id: message.id,
      role: message.role,
      text: message.text,
      timestamp: message.timestamp,
    }),
  );

  const handleSend = async () => {
    const value = input.trim();

    if (!value || loading) {
      return;
    }

    setInput("");

    await sendMessage(value);
  };

  const handleSuggestion = (
    value: string,
  ) => {
    setInput(value);
  };

  const handleClear = () => {
    clearConversation();
    setInput("");
  };

  return (
    <AppShell>
      <PageContainer
        className="chat-page"
        fullHeight
      >
        <section className="chat-page-shell">
          <header className="chat-page-header">
            <div className="chat-page-heading">
              <button
                type="button"
                className="chat-back-button"
                onClick={() =>
                  navigate(ROUTES.HOME)
                }
                aria-label="Back to home"
              >
                <ArrowLeft size={18} />
              </button>

              <div className="chat-page-avatar">
                <Bot size={18} />
              </div>

              <div>
                <div className="chat-page-title-row">
                  <h1>Ask Sagar</h1>

                  <span className="chat-online">
                    <i />
                    Ready
                  </span>
                </div>

                <p>
                  Marine intelligence for safer
                  decisions at sea.
                </p>
              </div>
            </div>

            {chatMessages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
              >
                <RotateCcw size={15} />
                New conversation
              </Button>
            )}
          </header>

          <div className="chat-page-content">
            <ChatWindow
              messages={chatMessages}
              loading={loading}
              onSuggestion={handleSuggestion}
            />
          </div>

          <div className="chat-page-composer">
            {error && (
              <div className="chat-error">
                <MessageCircle size={15} />
                <span>{error}</span>
              </div>
            )}

            <ChatInput
              value={input}
              onChange={setInput}
              onSend={handleSend}
              disabled={loading}
              placeholder="Ask Sagar about sea conditions, alerts, fishing zones or routes..."
            />

            <div className="chat-composer-footer">
              <div className="chat-composer-hint">
                <Sparkles size={13} />
                <span>
                  Ask naturally. Sagar will use the
                  available marine context.
                </span>
              </div>

              <span className="chat-composer-shortcut">
                Enter to send
              </span>
            </div>
          </div>
        </section>
      </PageContainer>
    </AppShell>
  );
}