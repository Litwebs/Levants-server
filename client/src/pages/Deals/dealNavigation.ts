import type { NavigateFunction } from "react-router-dom";

export const navigateWithDealTransition = (
  navigate: NavigateFunction,
  to: string,
  direction: "forward" | "back",
) => {
  const reduced = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const documentWithTransition = document as Document & {
    startViewTransition?: (update: () => void) => { finished: Promise<void> };
  };

  if (reduced || !documentWithTransition.startViewTransition) {
    navigate(to);
    return;
  }

  document.documentElement.dataset.pageTransition = direction;
  const transition = documentWithTransition.startViewTransition(() =>
    navigate(to),
  );
  void transition.finished.finally(() => {
    delete document.documentElement.dataset.pageTransition;
  });
};
