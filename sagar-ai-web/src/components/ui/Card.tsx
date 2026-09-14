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
  const Tag = onClick ? "button" : "div";

  return (
    <>
      <Tag
        type={onClick ? "button" : undefined}
        className={[
          "sagar-card",
          `sagar-card-${padding}`,
          interactive || onClick
            ? "sagar-card-interactive"
            : "",
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
          border: 1px solid #e6e4ec;
          border-radius: 18px;
          background: #ffffff;
          color: #16151d;
          text-align: left;
          font: inherit;
        }

        .sagar-card-sm {
          padding: 12px;
        }

        .sagar-card-md {
          padding: 16px;
        }

        .sagar-card-lg {
          padding: 20px;
        }

        .sagar-card-interactive {
          appearance: none;
          cursor: pointer;
          transition:
            border-color 160ms ease,
            box-shadow 160ms ease,
            transform 160ms ease;
        }

        .sagar-card-interactive:hover {
          border-color: #d5d2df;
          box-shadow: 0 8px 22px rgba(22, 21, 29, 0.07);
          transform: translateY(-1px);
        }

        .sagar-card-interactive:active {
          transform: translateY(0);
        }

        .sagar-card-interactive:focus-visible {
          outline: none;
          border-color: #8b5cf6;
          box-shadow:
            0 0 0 3px rgba(109, 40, 217, 0.12);
        }

        @media (max-width: 700px) {
          .sagar-card-sm {
            padding: 11px;
          }

          .sagar-card-md {
            padding: 14px;
            border-radius: 16px;
          }

          .sagar-card-lg {
            padding: 16px;
            border-radius: 17px;
          }
        }
      `}</style>
    </>
  );
}