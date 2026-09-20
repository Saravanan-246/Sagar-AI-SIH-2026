import type { ReactNode } from "react";

import "./PageContainer.css";

type PageContainerProps = {
  children: ReactNode;
  className?: string;
  fullHeight?: boolean;
};

export default function PageContainer({
  children,
  className = "",
  fullHeight = false,
}: PageContainerProps) {
  return (
    <div
      className={[
        "page-container",
        fullHeight ? "page-container-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}