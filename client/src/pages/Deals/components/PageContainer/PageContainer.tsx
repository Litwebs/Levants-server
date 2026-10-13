import type { ElementType, HTMLAttributes, ReactNode } from "react";
import styles from "./PageContainer.module.css";

type PageContainerWidth = "narrow" | "standard" | "wide" | "full";

interface PageContainerProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  as?: ElementType;
  width?: PageContainerWidth;
}

export const PageContainer = ({
  as: Component = "div",
  children,
  className = "",
  width = "wide",
  ...props
}: PageContainerProps) => (
  <Component
    className={[styles.container, styles[width], className]
      .filter(Boolean)
      .join(" ")}
    {...props}
  >
    {children}
  </Component>
);

PageContainer.displayName = "PageContainer";
