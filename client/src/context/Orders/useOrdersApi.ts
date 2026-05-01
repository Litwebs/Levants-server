import { useContext } from "react";
import { OrdersContext } from "./OrdersContext";

export const useOrdersApi = () => {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error("useOrdersApi must be used inside OrdersProvider");
  return ctx;
};
