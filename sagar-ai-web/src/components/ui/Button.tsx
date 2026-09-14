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
  ...props
}: ButtonProps) {
  return (
    <>
      <button
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
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-width: 0;
          border: 1px solid transparent;
          border-radius: 13px;
          font-family: inherit;
          font-weight: 700;
          line-height: 1;
          white-space: nowrap;
          cursor: pointer;
          user-select: none;
          transition:
            background-color 160ms ease,
            border-color 160ms ease,
            color 160ms ease,
            box-shadow 160ms ease,
            transform 160ms ease;
        }

        .sagar-button-sm {
          min-height: 36px;
          padding: 0 12px;
          font-size: 11px;
        }

        .sagar-button-md {
          min-height: 42px;
          padding: 0 15px;
          font-size: 12px;
        }

        .sagar-button-lg {
          min-height: 48px;
          padding: 0 18px;
          font-size: 13px;
          border-radius: 15px;
        }

        .sagar-button-primary {
          background: #6d28d9;
          border-color: #6d28d9;
          color: #ffffff;
          box-shadow: 0 5px 14px rgba(109, 40, 217, 0.18);
        }

        .sagar-button-primary:hover:not(:disabled) {
          background: #5b21b6;
          border-color: #5b21b6;
          box-shadow: 0 7px 18px rgba(109, 40, 217, 0.22);
          transform: translateY(-1px);
        }

        .sagar-button-primary:active:not(:disabled) {
          transform: translateY(0);
        }

        .sagar-button-secondary {
          background: #ffffff;
          border-color: #e6e4ec;
          color: #16151d;
        }

        .sagar-button-secondary:hover:not(:disabled) {
          background: #f7f5fb;
          border-color: #d5d2df;
        }

        .sagar-button-ghost {
          background: transparent;
          border-color: transparent;
          color: #676572;
        }

        .sagar-button-ghost:hover:not(:disabled) {
          background: #f2f1f8;
          color: #16151d;
        }

        .sagar-button-danger {
          background: #d64545;
          border-color: #d64545;
          color: #ffffff;
        }

        .sagar-button-danger:hover:not(:disabled) {
          background: #bf3838;
          border-color: #bf3838;
          transform: translateY(-1px);
        }

        .sagar-button-full {
          width: 100%;
        }

        .sagar-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }

        .sagar-button:focus-visible {
          outline: none;
          box-shadow:
            0 0 0 3px rgba(109, 40, 217, 0.14);
        }

        @media (max-width: 700px) {
          .sagar-button-md {
            min-height: 44px;
          }

          .sagar-button-lg {
            min-height: 46px;
          }
        }
      `}</style>
    </>
  );
}