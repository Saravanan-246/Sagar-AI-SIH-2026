import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
  interactive?: boolean;
  onClick?: () => void;
};

export default function Card({
  children,
  className = "",
  padding = "md",
  interactive = false,
  onClick,
}: CardProps) {
  const isClickable = Boolean(onClick || interactive);
  const Tag = onClick ? "button" : "div";

  return (
    <>
      <Tag
        type={onClick ? "button" : undefined}
        className={[
          "sagar-card",
          `sagar-card-${padding}`,
          isClickable ? "sagar-card-interactive" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={onClick}
      >
        {children}
      </Tag>

      <style>{`
        .sagar-card {
          width: 100%;
          min-width: 0;
          display: block;
          box-sizing: border-box;
          position: relative;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          color: #0f172a;
          text-align: left;
          font: inherit;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        .sagar-card-sm {
          padding: 12px 14px;
        }

        .sagar-card-md {
          padding: 16px 18px;
        }

        .sagar-card-lg {
          padding: 22px 24px;
        }

        .sagar-card-interactive {
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
          user-select: none;
          -webkit-user-select: none;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          transition:
            border-color 140ms cubic-bezier(0.4, 0, 0.2, 1),
            box-shadow 140ms cubic-bezier(0.4, 0, 0.2, 1),
            transform 100ms ease;
        }

        .sagar-card-interactive:hover {
          border-color: #cbd5e1;
          box-shadow: 0 4px 12px -2px rgba(15, 23, 42, 0.08), 0 2px 6px -1px rgba(15, 23, 42, 0.04);
          transform: translateY(-1px);
        }

        .sagar-card-interactive:active {
          transform: scale(0.995);
          box-shadow: 0 1px 2px 0 rgba(15, 23, 42, 0.05);
        }

        .sagar-card-interactive:focus-visible {
          outline: none;
          border-color: #7c3aed;
          box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #7c3aed;
        }

        @media (max-width: 640px) {
          .sagar-card {
            border-radius: 12px;
          }

          .sagar-card-sm {
            padding: 10px 12px;
          }

          .sagar-card-md {
            padding: 14px;
          }

          .sagar-card-lg {
            padding: 18px;
          }
        }
      `}</style>
    </>
  );
}