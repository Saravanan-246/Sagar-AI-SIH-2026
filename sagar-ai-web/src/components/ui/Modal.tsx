import {
  useEffect,
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
          aria-labelledby={
            title ? "sagar-modal-title" : undefined
          }
        >
          <div className="sagar-modal-header">
            <div className="sagar-modal-heading">
              {title && (
                <h2 id="sagar-modal-title">
                  {title}
                </h2>
              )}

              {description && (
                <p>{description}</p>
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
          padding: 20px;
          background: rgba(22, 21, 29, 0.42);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }

        .sagar-modal {
          width: 100%;
          max-height: min(760px, calc(100vh - 40px));
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid #e6e4ec;
          border-radius: 20px;
          background: #ffffff;
          box-shadow:
            0 24px 70px rgba(22, 21, 29, 0.18),
            0 5px 20px rgba(22, 21, 29, 0.08);
          animation: sagar-modal-in 160ms ease-out;
        }

        .sagar-modal-sm {
          max-width: 420px;
        }

        .sagar-modal-md {
          max-width: 560px;
        }

        .sagar-modal-lg {
          max-width: 760px;
        }

        .sagar-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          padding: 20px 20px 16px;
          border-bottom: 1px solid #eceaf1;
        }

        .sagar-modal-heading {
          min-width: 0;
        }

        .sagar-modal-heading h2 {
          margin: 0;
          color: #16151d;
          font-size: 18px;
          line-height: 24px;
          font-weight: 800;
          letter-spacing: -0.2px;
        }

        .sagar-modal-heading p {
          margin: 5px 0 0;
          color: #676572;
          font-size: 12px;
          line-height: 19px;
        }

        .sagar-modal-close {
          width: 36px;
          height: 36px;
          flex: 0 0 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #e6e4ec;
          border-radius: 11px;
          background: #ffffff;
          color: #676572;
          cursor: pointer;
          transition:
            background-color 160ms ease,
            color 160ms ease,
            border-color 160ms ease,
            transform 160ms ease;
        }

        .sagar-modal-close:hover {
          background: #f3edff;
          color: #6d28d9;
          border-color: #e0d5f7;
        }

        .sagar-modal-close:active {
          transform: scale(0.96);
        }

        .sagar-modal-close:focus-visible {
          outline: none;
          box-shadow:
            0 0 0 3px rgba(109, 40, 217, 0.12);
        }

        .sagar-modal-body {
          min-height: 0;
          overflow-y: auto;
          padding: 20px;
        }

        .sagar-modal-body::-webkit-scrollbar {
          width: 6px;
        }

        .sagar-modal-body::-webkit-scrollbar-thumb {
          background: #dcd9e4;
          border-radius: 999px;
        }

        .sagar-modal-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          padding: 14px 20px;
          border-top: 1px solid #eceaf1;
          background: #faf9fc;
        }

        @keyframes sagar-modal-in {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.99);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .sagar-modal {
            animation: none;
          }
        }

        @media (max-width: 700px) {
          .sagar-modal-backdrop {
            align-items: flex-end;
            padding: 0;
          }

          .sagar-modal {
            max-height: calc(100dvh - 20px);
            border-radius: 20px 20px 0 0;
            border-bottom: 0;
          }

          .sagar-modal-sm,
          .sagar-modal-md,
          .sagar-modal-lg {
            max-width: 100%;
          }

          .sagar-modal-header {
            padding: 17px 16px 14px;
          }

          .sagar-modal-body {
            padding: 16px;
          }

          .sagar-modal-footer {
            padding: 12px 16px;
          }
        }
      `}</style>
    </>
  );
}