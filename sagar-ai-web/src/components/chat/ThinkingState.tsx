type ThinkingStateProps = {
  label?: string;
};

export default function ThinkingState({
  label = "Sagar is thinking…",
}: ThinkingStateProps) {
  return (
    <div className="thinking-state" aria-live="polite">
      <div className="thinking-avatar" aria-hidden="true">
        S
      </div>

      <div className="thinking-content">
        <span className="thinking-label">{label}</span>

        <span className="thinking-dots" aria-hidden="true">
          <span className="thinking-dot" />
          <span className="thinking-dot" />
          <span className="thinking-dot" />
        </span>
      </div>
    </div>
  );
}
