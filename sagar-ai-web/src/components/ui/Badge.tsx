type BadgeProps = {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "violet";
  size?: "sm" | "md";
};

export default function Badge({
  children,
  tone = "neutral",
  size = "md",
}: BadgeProps) {
  return (
    <span
      className={`sagar-badge sagar-badge-${tone} sagar-badge-${size}`}
    >
      {children}

      <style>{`
        .sagar-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: fit-content;
          border: 1px solid transparent;
          border-radius: 999px;
          font-family: inherit;
          font-weight: 700;
          white-space: nowrap;
          line-height: 1;
        }

        .sagar-badge-sm {
          min-height: 24px;
          padding: 0 8px;
          font-size: 10px;
        }

        .sagar-badge-md {
          min-height: 29px;
          padding: 0 10px;
          font-size: 11px;
        }

        .sagar-badge-neutral {
          background: #f2f1f8;
          border-color: #e6e4ec;
          color: #676572;
        }

        .sagar-badge-success {
          background: #e8f7f0;
          border-color: #d7eee4;
          color: #159a68;
        }

        .sagar-badge-warning {
          background: #fff4da;
          border-color: #f0e2b9;
          color: #a56f00;
        }

        .sagar-badge-danger {
          background: #fcebec;
          border-color: #f0c9cc;
          color: #c23b3b;
        }

        .sagar-badge-violet {
          background: #f0eafe;
          border-color: #e3d8fb;
          color: #6d28d9;
        }
      `}</style>
    </span>
  );
}