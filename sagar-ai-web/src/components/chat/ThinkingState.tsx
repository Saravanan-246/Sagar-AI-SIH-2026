import "./ThinkingState.css";

type ThinkingStateProps = {
  label?: string;
  /** Real pipeline stages that apply to the pending question. Always
   * rendered as pending (a neutral marker, never a checkmark) - no stage
   * here is ever claimed to be done before the real answer has actually
   * arrived and replaced this whole bubble. */
  stages?: string[];
};

export default function ThinkingState({
  label = "Sagar is thinking…",
  stages,
}: ThinkingStateProps) {
  const hasStages = Boolean(stages && stages.length > 0);

  return (
    <div className="thinking-state" aria-live="polite">
      <div className="thinking-avatar" aria-hidden="true">
        S
      </div>

      <div className={hasStages ? "thinking-content thinking-content-stages" : "thinking-content"}>
        {hasStages ? (
          <ul className="thinking-stages">
            {stages!.map((stage) => (
              <li key={stage} className="thinking-stage">
                <span className="thinking-stage-marker" aria-hidden="true" />
                <span className="thinking-stage-label">{stage}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="thinking-label">{label}</span>
        )}

        <span className="thinking-dots" aria-hidden="true">
          <span className="thinking-dot" />
          <span className="thinking-dot" />
          <span className="thinking-dot" />
        </span>
      </div>
    </div>
  );
}