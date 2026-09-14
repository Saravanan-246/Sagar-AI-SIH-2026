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
          <Icon size={21} strokeWidth={1.9} />
        </div>

        <h2 className="sagar-empty-title">
          {title}
        </h2>

        {description && (
          <p className="sagar-empty-description">
            {description}
          </p>
        )}

        {action && (
          <div className="sagar-empty-action">
            {resolvedAction}
          </div>
        )}
      </section>

      <style>{`
        .sagar-empty-state {
          width: 100%;
          min-height: 260px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          padding: 32px 20px;
          text-align: center;
          border: 1px dashed #dcd9e4;
          border-radius: 18px;
          background: #faf9fc;
        }

        .sagar-empty-icon {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 15px;
          background: #f0eafe;
          color: #6d28d9;
        }

        .sagar-empty-title {
          margin: 15px 0 0;
          color: #16151d;
          font-size: 16px;
          line-height: 22px;
          font-weight: 800;
          letter-spacing: -0.1px;
        }

        .sagar-empty-description {
          max-width: 430px;
          margin: 7px 0 0;
          color: #676572;
          font-size: 12px;
          line-height: 19px;
        }

        .sagar-empty-action {
          margin-top: 16px;
        }

        @media (max-width: 700px) {
          .sagar-empty-state {
            min-height: 220px;
            padding: 26px 16px;
            border-radius: 16px;
          }

          .sagar-empty-title {
            font-size: 15px;
          }

          .sagar-empty-description {
            font-size: 11px;
            line-height: 18px;
          }
        }
      `}</style>
    </>
  );
}