import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import styles from "./LoadingScreen.module.css";

interface LoadingScreenProps {
  label?: string;
  active?: boolean;
  delayMs?: number;
  minimumVisibleMs?: number;
  variant?: "fullscreen" | "overlay" | "contained";
}

export function LoadingScreen({
  label = "Loading…",
  active = true,
  delayMs = 0,
  minimumVisibleMs = 0,
  variant = "fullscreen",
}: LoadingScreenProps) {
  const initiallyVisible = active && delayMs === 0;
  const [rendered, setRendered] = useState(initiallyVisible);
  const [visible, setVisible] = useState(initiallyVisible);
  const renderedRef = useRef(initiallyVisible);
  const visibleSinceRef = useRef(initiallyVisible ? Date.now() : 0);

  useEffect(() => {
    let revealTimer: number | undefined;
    let hideTimer: number | undefined;
    let removeTimer: number | undefined;
    let frameId: number | undefined;

    const reveal = () => {
      renderedRef.current = true;
      setRendered(true);
      frameId = window.requestAnimationFrame(() => {
        visibleSinceRef.current = Date.now();
        setVisible(true);
      });
    };

    if (active) {
      if (renderedRef.current) {
        setVisible(true);
      } else if (delayMs > 0) {
        revealTimer = window.setTimeout(reveal, delayMs);
      } else {
        reveal();
      }
    } else if (renderedRef.current) {
      const elapsed = Date.now() - visibleSinceRef.current;
      const remaining = Math.max(0, minimumVisibleMs - elapsed);

      hideTimer = window.setTimeout(() => {
        setVisible(false);
        removeTimer = window.setTimeout(() => {
          renderedRef.current = false;
          setRendered(false);
        }, 180);
      }, remaining);
    }

    return () => {
      if (revealTimer !== undefined) window.clearTimeout(revealTimer);
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      if (removeTimer !== undefined) window.clearTimeout(removeTimer);
      if (frameId !== undefined) window.cancelAnimationFrame(frameId);
    };
  }, [active, delayMs, minimumVisibleMs]);

  if (!rendered) return null;

  return (
    <div
      className={`${styles.backdrop} ${styles[variant]} ${visible ? styles.visible : styles.hidden}`}
      role="status"
      aria-live="polite"
      aria-label={label}
      aria-hidden={!active}
    >
      <div className={styles.indicator}>
        <Loader2 size={22} className={styles.spinner} />
        <div className={styles.label}>{label}</div>
      </div>
    </div>
  );
}
