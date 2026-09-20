import {
  Inbox,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateAction = {
  label: string;
  onClick?: () => void;
};

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode | EmptyStateAction;
};

function isActionDescriptor(
  action: ReactNode | EmptyStateAction
): action is EmptyStateAction {
  return (
    typeof action === "object" &&
    action !== null &&
    "label" in action &&
    !("$$typeof" in (action as Record<string, unknown>))
  );
}

export default function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
}: EmptyStateProps) {
  let resolvedAction: ReactNode = null;

  if (action) {
    resolvedAction = isActionDescriptor(action) ? (
      <button
        type="button"
        className="sagar-empty-action-button"
        onClick={action.onClick}
      >
        {action.label}
      </button>
    ) : (
      action
    );
  }

  return (
    <>
      <section className="sagar-empty-state">
        <div className="sagar-empty-icon" aria-hidden="true">
          <Icon size={22} strokeWidth={1.8} />
        </div>

        <h2 className="sagar-empty-title">{title}</h2>

        {description && (
          <p className="sagar-empty-description">{description}</p>
        )}

        {action && (
          <div className="sagar-empty-action">{resolvedAction}</div>
        )}
      </section>

      <style>{`
        .sagar-empty-state {
          width: 100%;
          min-height: 240px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          padding: 36px 20px;
          text-align: center;
          border: 1px dashed #cbd5e1;
          border-radius: 14px;
          background: #f8fafc;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        .sagar-empty-icon {
          width: 48px;
          height: 48px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          color: #64748b;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
        }

        .sagar-empty-title {
          margin: 14px 0 0;
          color: #0f172a;
          font-size: 15px;
          font-weight: 600;
          line-height: 1.4;
          letter-spacing: -0.01em;
        }

        .sagar-empty-description {
          max-width: 380px;
          margin: 6px 0 0;
          color: #64748b;
          font-size: 13px;
          line-height: 1.5;
          text-wrap: balance;
        }

        .sagar-empty-action {
          margin-top: 18px;
        }

        .sagar-empty-action-button {
          appearance: none;
          -webkit-appearance: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 38px;
          padding: 0 16px;
          border: 1px solid #5b21b6;
          border-radius: 8px;
          background: #6d28d9;
          color: #ffffff;
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          line-height: 1;
          letter-spacing: -0.01em;
          white-space: nowrap;
          cursor: pointer;
          user-select: none;
          -webkit-user-select: none;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          box-shadow: 0 1px 2px rgba(109, 40, 217, 0.16);
          transition:
            background-color 140ms ease,
            border-color 140ms ease,
            transform 100ms ease,
            box-shadow 140ms ease;
        }

        .sagar-empty-action-button:hover {
          background: #5b21b6;
          border-color: #4c1d95;
          box-shadow: 0 2px 6px rgba(109, 40, 217, 0.22);
        }

        .sagar-empty-action-button:active {
          transform: scale(0.985);
        }

        .sagar-empty-action-button:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #7c3aed;
        }

        @media (max-width: 640px) {
          .sagar-empty-state {
            min-height: 200px;
            padding: 28px 16px;
            border-radius: 12px;
          }

          .sagar-empty-icon {
            width: 44px;
            height: 44px;
            border-radius: 10px;
          }

          .sagar-empty-title {
            font-size: 14px;
          }

          .sagar-empty-description {
            font-size: 12.5px;
            max-width: 320px;
          }

          .sagar-empty-action-button {
            height: 42px;
            padding: 0 18px;
            font-size: 13.5px;
          }
        }
      `}</style>
    </>
  );
}