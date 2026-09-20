import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <>
      <button
        type={type}
        className={[
          "sagar-button",
          `sagar-button-${variant}`,
          `sagar-button-${size}`,
          fullWidth ? "sagar-button-full" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      >
        {children}
      </button>

      <style>{`
        .sagar-button {
          appearance: none;
          -webkit-appearance: none;
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-width: 0;
          border: 1px solid transparent;
          border-radius: 10px;
          font-family: inherit;
          font-weight: 600;
          letter-spacing: -0.01em;
          line-height: 1;
          white-space: nowrap;
          cursor: pointer;
          user-select: none;
          -webkit-user-select: none;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          transition:
            background-color 140ms cubic-bezier(0.4, 0, 0.2, 1),
            border-color 140ms cubic-bezier(0.4, 0, 0.2, 1),
            color 140ms cubic-bezier(0.4, 0, 0.2, 1),
            box-shadow 140ms cubic-bezier(0.4, 0, 0.2, 1),
            transform 100ms ease;
        }

        /* Sizes & Typography */
        .sagar-button-sm {
          min-height: 32px;
          padding: 0 12px;
          font-size: 12px;
          border-radius: 8px;
        }

        .sagar-button-md {
          min-height: 40px;
          padding: 0 16px;
          font-size: 13.5px;
          border-radius: 10px;
        }

        .sagar-button-lg {
          min-height: 46px;
          padding: 0 20px;
          font-size: 14.5px;
          border-radius: 12px;
        }

        /* Variant: Primary */
        .sagar-button-primary {
          background-color: #6d28d9;
          border-color: #5b21b6;
          color: #ffffff;
          box-shadow: 0 1px 2px rgba(109, 40, 217, 0.16), 0 3px 8px rgba(109, 40, 217, 0.12);
        }

        .sagar-button-primary:hover:not(:disabled) {
          background-color: #5b21b6;
          border-color: #4c1d95;
          box-shadow: 0 2px 4px rgba(109, 40, 217, 0.2), 0 6px 14px rgba(109, 40, 217, 0.18);
        }

        .sagar-button-primary:active:not(:disabled) {
          background-color: #4c1d95;
          transform: scale(0.985);
          box-shadow: 0 1px 2px rgba(109, 40, 217, 0.2);
        }

        /* Variant: Secondary */
        .sagar-button-secondary {
          background-color: #ffffff;
          border-color: #e2e8f0;
          color: #1e293b;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
        }

        .sagar-button-secondary:hover:not(:disabled) {
          background-color: #f8fafc;
          border-color: #cbd5e1;
          color: #0f172a;
        }

        .sagar-button-secondary:active:not(:disabled) {
          background-color: #f1f5f9;
          border-color: #94a3b8;
          transform: scale(0.985);
        }

        /* Variant: Ghost */
        .sagar-button-ghost {
          background-color: transparent;
          border-color: transparent;
          color: #64748b;
        }

        .sagar-button-ghost:hover:not(:disabled) {
          background-color: #f1f5f9;
          color: #0f172a;
        }

        .sagar-button-ghost:active:not(:disabled) {
          background-color: #e2e8f0;
          transform: scale(0.985);
        }

        /* Variant: Danger */
        .sagar-button-danger {
          background-color: #dc2626;
          border-color: #b91c1c;
          color: #ffffff;
          box-shadow: 0 1px 2px rgba(220, 38, 38, 0.16);
        }

        .sagar-button-danger:hover:not(:disabled) {
          background-color: #b91c1c;
          border-color: #991b1b;
          box-shadow: 0 3px 8px rgba(220, 38, 38, 0.22);
        }

        .sagar-button-danger:active:not(:disabled) {
          background-color: #991b1b;
          transform: scale(0.985);
        }

        /* Modifiers & States */
        .sagar-button-full {
          width: 100%;
        }

        .sagar-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          box-shadow: none !important;
          transform: none !important;
          pointer-events: none;
        }

        .sagar-button:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #7c3aed;
        }

        /* Mobile Adjustments (Touch targets compliant with standard UI guidelines) */
        @media (max-width: 640px) {
          .sagar-button-sm {
            min-height: 36px;
            padding: 0 12px;
          }

          .sagar-button-md {
            min-height: 44px;
            padding: 0 16px;
          }

          .sagar-button-lg {
            min-height: 48px;
            padding: 0 20px;
          }
        }
      `}</style>
    </>
  );
}