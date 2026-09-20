import {
  useEffect,
  useId,
  type ReactNode,
} from "react";
import { X } from "lucide-react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
};

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: ModalProps) {
  const generatedId = useId();
  const titleId = `sagar-modal-title-${generatedId}`;
  const descId = `sagar-modal-desc-${generatedId}`;

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="sagar-modal-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
      >
        <div
          className={`sagar-modal sagar-modal-${size}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          aria-describedby={description ? descId : undefined}
        >
          <div className="sagar-modal-header">
            <div className="sagar-modal-heading">
              {title && (
                <h2 id={titleId}>
                  {title}
                </h2>
              )}

              {description && (
                <p id={descId}>{description}</p>
              )}
            </div>

            <button
              type="button"
              className="sagar-modal-close"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>

          <div className="sagar-modal-body">
            {children}
          </div>

          {footer && (
            <div className="sagar-modal-footer">
              {footer}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .sagar-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          animation: sagar-fade-in 140ms ease-out;
        }

        .sagar-modal {
          width: 100%;
          max-height: min(780px, calc(100vh - 48px));
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          box-shadow:
            0 20px 25px -5px rgba(0, 0, 0, 0.1),
            0 8px 10px -6px rgba(0, 0, 0, 0.1);
          animation: sagar-modal-in 180ms cubic-bezier(0.16, 1, 0.3, 1);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        .sagar-modal-sm {
          max-width: 440px;
        }

        .sagar-modal-md {
          max-width: 580px;
        }

        .sagar-modal-lg {
          max-width: 760px;
        }

        .sagar-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 20px 24px;
          border-bottom: 1px solid #f1f5f9;
        }

        .sagar-modal-heading {
          min-width: 0;
          flex: 1;
        }

        .sagar-modal-heading h2 {
          margin: 0;
          color: #0f172a;
          font-size: 17px;
          font-weight: 600;
          line-height: 1.4;
          letter-spacing: -0.015em;
        }

        .sagar-modal-heading p {
          margin: 4px 0 0;
          color: #64748b;
          font-size: 13px;
          line-height: 1.5;
        }

        .sagar-modal-close {
          appearance: none;
          -webkit-appearance: none;
          width: 32px;
          height: 32px;
          flex: 0 0 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #ffffff;
          color: #64748b;
          cursor: pointer;
          user-select: none;
          -webkit-user-select: none;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          transition:
            background-color 140ms ease,
            border-color 140ms ease,
            color 140ms ease,
            transform 100ms ease;
        }

        .sagar-modal-close:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
          color: #0f172a;
        }

        .sagar-modal-close:active {
          transform: scale(0.95);
        }

        .sagar-modal-close:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #7c3aed;
        }

        .sagar-modal-body {
          min-height: 0;
          flex: 1 1 auto;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 24px;
          color: #334155;
          font-size: 14px;
          line-height: 1.6;
        }

        .sagar-modal-body::-webkit-scrollbar {
          width: 5px;
        }

        .sagar-modal-body::-webkit-scrollbar-track {
          background: transparent;
        }

        .sagar-modal-body::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 9999px;
        }

        .sagar-modal-body::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .sagar-modal-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          padding: 16px 24px;
          border-top: 1px solid #f1f5f9;
          background: #f8fafc;
        }

        @keyframes sagar-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes sagar-modal-in {
          from {
            opacity: 0;
            transform: scale(0.97) translateY(4px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .sagar-modal-backdrop,
          .sagar-modal {
            animation: none;
          }
        }

        /* Responsive Bottom-Sheet Presentation for Mobile */
        @media (max-width: 640px) {
          .sagar-modal-backdrop {
            align-items: flex-end;
            padding: 0;
          }

          .sagar-modal {
            max-height: calc(100dvh - 32px);
            border-radius: 18px 18px 0 0;
            border-bottom: 0;
            border-left: 0;
            border-right: 0;
            animation: sagar-sheet-in 220ms cubic-bezier(0.16, 1, 0.3, 1);
          }

          .sagar-modal-sm,
          .sagar-modal-md,
          .sagar-modal-lg {
            max-width: 100%;
          }

          .sagar-modal-header {
            padding: 16px 18px 14px;
          }

          .sagar-modal-heading h2 {
            font-size: 16px;
          }

          .sagar-modal-heading p {
            font-size: 12.5px;
          }

          .sagar-modal-close {
            width: 36px;
            height: 36px;
            flex: 0 0 36px;
          }

          .sagar-modal-body {
            padding: 18px;
            font-size: 13.5px;
          }

          .sagar-modal-footer {
            padding: 14px 18px;
            gap: 8px;
          }
        }

        @keyframes sagar-sheet-in {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}