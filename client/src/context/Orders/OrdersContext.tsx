import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

import api from "../api";
import OrdersReducer, {
  ORDERS_FAILURE,
  ORDERS_LIST_SUCCESS,
  ORDERS_REQUEST,
  ORDERS_SET_CURRENT,
  ORDERS_UPDATE_SUCCESS,
} from "./OrdersReducer";

import type {
  AdminOrder,
  ListOrdersResult,
  OrdersListMeta,
  OrdersState,
  RefundOrderResult,
} from "./constants";

import { initialOrdersState } from "./constants";

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

const unwrapData = <T,>(payload: unknown): T | null => {
  if (!payload || typeof payload !== "object") return null;
  const maybeEnvelope = payload as ApiEnvelope<T>;
  if ("data" in maybeEnvelope) return (maybeEnvelope.data ?? null) as T | null;
  return payload as T;
};

type OrdersContextType = {
  orders: OrdersState["orders"];
  meta: OrdersState["meta"];
  currentOrder: OrdersState["currentOrder"];
  loading: OrdersState["loading"];
  error: OrdersState["error"];

  listOrders: (params?: {
    page?: number;
    pageSize?: number;

    // filters
    status?: string | string[];
    search?: string;
    minTotal?: number | string;
    maxTotal?: number | string;
    dateFrom?: string;
    dateTo?: string;
    refundedOnly?: boolean;
    expiredOnly?: boolean;

    // sorting
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) => Promise<ListOrdersResult>;

  getOrderById: (orderId: string) => Promise<AdminOrder>;

  updateOrderStatus: (
    orderId: string,
    status: "pending" | "paid" | "cancelled" | "refunded",
  ) => Promise<AdminOrder>;

  refundOrder: (
    orderId: string,
    body?: { reason?: string; restock?: boolean },
  ) => Promise<RefundOrderResult>;
};

const OrdersContext = createContext<OrdersContextType | null>(null);

export const OrdersProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(OrdersReducer, initialOrdersState);

  const listOrders = useCallback(
    async (params?: {
      page?: number;
      pageSize?: number;

      status?: string | string[];
      search?: string;
      minTotal?: number | string;
      maxTotal?: number | string;
      dateFrom?: string;
      dateTo?: string;
      refundedOnly?: boolean;
      expiredOnly?: boolean;

      sortBy?: string;
      sortOrder?: "asc" | "desc";
    }) => {
      dispatch({ type: ORDERS_REQUEST });
      try {
        const res = await api.get("/admin/orders", {
          params: {
            page: params?.page,
            pageSize: params?.pageSize,

            status: params?.status,
            search: params?.search,
            minTotal: params?.minTotal,
            maxTotal: params?.maxTotal,
            dateFrom: params?.dateFrom,
            dateTo: params?.dateTo,
            refundedOnly: params?.refundedOnly,
            expiredOnly: params?.expiredOnly,

            sortBy: params?.sortBy,
            sortOrder: params?.sortOrder,
          },
        });

        const data = unwrapData<{
          orders?: AdminOrder[];
          meta?: OrdersListMeta;
        }>(res.data);

        const orders = data?.orders ?? [];
        const meta = data?.meta ?? null;

        dispatch({ type: ORDERS_LIST_SUCCESS, payload: { orders, meta } });
        return { orders, meta };
      } catch (err: any) {
        const msg = err?.response?.data?.message || "Failed to load orders";
        dispatch({ type: ORDERS_FAILURE, payload: msg });
        throw err;
      }
    },
    [],
  );

  const getOrderById = useCallback(async (orderId: string) => {
    dispatch({ type: ORDERS_REQUEST });
    try {
      const res = await api.get(`/admin/orders/${orderId}`);
      const order = unwrapData<AdminOrder>(res.data);
      if (!order?._id) throw new Error("Order not found");

      dispatch({ type: ORDERS_SET_CURRENT, payload: { order } });
      return order;
    } catch (err: any) {
      const msg = err?.response?.data?.message || "Failed to load order";
      dispatch({ type: ORDERS_FAILURE, payload: msg });
      throw err;
    }
  }, []);

  const updateOrderStatus = useCallback(
    async (
      orderId: string,
      status: "pending" | "paid" | "cancelled" | "refunded",
    ) => {
      dispatch({ type: ORDERS_REQUEST });
      try {
        const res = await api.put(`/admin/orders/${orderId}/status`, {
          status,
        });
        const order = unwrapData<AdminOrder>(res.data);
        if (!order?._id) throw new Error("Failed to update order status");

        dispatch({ type: ORDERS_UPDATE_SUCCESS, payload: { order } });
        return order;
      } catch (err: any) {
        const msg =
          err?.response?.data?.message || "Failed to update order status";
        dispatch({ type: ORDERS_FAILURE, payload: msg });
        throw err;
      }
    },
    [],
  );

  const refundOrder = useCallback(
    async (orderId: string, body?: { reason?: string; restock?: boolean }) => {
      dispatch({ type: ORDERS_REQUEST });
      try {
        const res = await api.post(`/admin/orders/${orderId}/refund`, {
          reason: body?.reason,
          restock: body?.restock,
        });

        const data = unwrapData<RefundOrderResult>(res.data);
        if (!data?.refundId) throw new Error("Refund failed");

        // Refresh the order details/list view if this order is already loaded.
        // (Refund endpoint returns refund info, not the updated order model.)
        try {
          const orderRes = await api.get(`/admin/orders/${orderId}`);
          const order = unwrapData<AdminOrder>(orderRes.data);
          if (order?._id) {
            dispatch({ type: ORDERS_UPDATE_SUCCESS, payload: { order } });
            dispatch({ type: ORDERS_SET_CURRENT, payload: { order } });
          }
        } catch {
          // best-effort refresh
        }

        return data;
      } catch (err: any) {
        const msg = err?.response?.data?.message || "Failed to refund order";
        dispatch({ type: ORDERS_FAILURE, payload: msg });
        throw err;
      }
    },
    [],
  );

  const value = useMemo(
    () => ({
      orders: state.orders,
      meta: state.meta,
      currentOrder: state.currentOrder,
      loading: state.loading,
      error: state.error,
      listOrders,
      getOrderById,
      updateOrderStatus,
      refundOrder,
    }),
    [state, listOrders, getOrderById, updateOrderStatus, refundOrder],
  );

  return (
    <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
  );
};

export const useOrdersApi = () => {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error("useOrdersApi must be used inside OrdersProvider");
  return ctx;
};
