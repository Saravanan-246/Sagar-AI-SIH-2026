import { MessageCircle } from "lucide-react";

const suggestions = [
  "Is it safe to venture into the sea tomorrow morning?",
  "Are there any lightning or cyclone alerts in my area?",
  "What are the sea conditions near my location?",
  "Which fishing zones should be avoided?",
];

type ChatWelcomeProps = {
  onSuggestion?: (value: string) => void;
};

export default function ChatWelcome({
  onSuggestion,
}: ChatWelcomeProps) {
  return (
    <section className="chat-welcome">
      <div className="chat-welcome-inner">
        <div className="chat-welcome-icon" aria-hidden="true">
          <MessageCircle size={22} strokeWidth={2} />
        </div>

        <h1 className="chat-welcome-title">
          How can I help?
        </h1>

        <p className="chat-welcome-description">
          Ask Sagar about marine safety, weather, ocean
          conditions, routes, fishing areas, or hazards.
        </p>

        <div className="chat-suggestions">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="chat-suggestion"
              onClick={() => onSuggestion?.(suggestion)}
            >
              <span>{suggestion}</span>
              <span
                className="chat-suggestion-arrow"
                aria-hidden="true"
              >
                →
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}