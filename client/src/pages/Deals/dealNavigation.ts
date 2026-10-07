import type { NavigateFunction } from "react-router-dom";

export const navigateWithDealTransition = (
  navigate: NavigateFunction,
  to: string,
  _direction: "forward" | "back",
) => {
  navigate(to);
};
