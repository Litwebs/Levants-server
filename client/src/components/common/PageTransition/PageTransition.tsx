import type { ReactNode } from "react";
import { useRef } from "react";
import { useLocation } from "react-router-dom";
import styles from "./PageTransition.module.css";

type TransitionDirection = "forward" | "back" | "none";

const getSegments = (pathname: string) =>
  pathname.split("/").filter(Boolean);

const getDirection = (
  previousPathname: string,
  nextPathname: string,
): TransitionDirection => {
  if (previousPathname === nextPathname) return "none";

  const previous = getSegments(previousPathname);
  const next = getSegments(nextPathname);
  const sameSection = previous[0] && previous[0] === next[0];

  if (!sameSection) return "none";
  if (next.length > previous.length) return "forward";
  if (next.length < previous.length) return "back";
  return "none";
};

export const PageTransition = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const transition = useRef<{
    pathname: string;
    direction: TransitionDirection;
  }>({
    pathname: location.pathname,
    direction: "none",
  });

  if (transition.current.pathname !== location.pathname) {
    transition.current = {
      direction: getDirection(
        transition.current.pathname,
        location.pathname,
      ),
      pathname: location.pathname,
    };
  }

  const directionClass =
    transition.current.direction === "forward"
      ? styles.forward
      : transition.current.direction === "back"
        ? styles.back
        : "";

  return (
    <div
      key={location.pathname}
      className={`${styles.page} ${directionClass}`.trim()}
    >
      {children}
    </div>
  );
};

PageTransition.displayName = "PageTransition";
