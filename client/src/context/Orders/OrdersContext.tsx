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
  ORDERS_BULK_UPDATE_SUCCESS,
} from "./OrdersReducer";

import type {
  AdminOrder,
  ListOrdersResult,
  OrdersListMeta,
  OrdersState,
  OrdersStockRequirements,
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
    deliveryStatus?: string | string[];
    paymentStatus?: string | string[];
    orderSource?: "all" | "imported" | "website" | (string & {});
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
    status: "ordered" | "dispatched" | "in_transit" | "delivered" | "returned",
    deliveryProofFile?: File,
  ) => Promise<AdminOrder>;

  updateOrderPaymentStatus: (
    orderId: string,
    paid: boolean,
  ) => Promise<AdminOrder>;

  updateOrderItems: (
    orderId: string,
    items: { variantId: string; quantity: number }[],
  ) => Promise<AdminOrder>;

  deleteOrder: (orderId: string) => Promise<{ deleted: true; orderId: string }>;

  bulkDeleteOrders: (
    orderIds: string[],
  ) => Promise<{ matched: number; deleted: number }>;

  refundOrder: (
    orderId: string,
    body?: { amount?: number; reason?: string; restock?: boolean },
  ) => Promise<RefundOrderResult>;

  bulkUpdateDeliveryStatus: (
    orderIds: string[],
    deliveryStatus:
      | "ordered"
      | "dispatched"
      | "in_transit"
      | "delivered"
      | "returned",
  ) => Promise<{ matched: number; modified: number }>;

  bulkAssignDeliveryDate: (
    orderIds: string[],
    deliveryDate: string,
  ) => Promise<{ matched: number; modified: number }>;

  getOrdersStockRequirements: (params: {
    orderIds?: string[];
    ordersFile?: File;
  }) => Promise<OrdersStockRequirements>;
};

const OrdersContext = createContext<OrdersContextType | null>(null);

export const OrdersProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(OrdersReducer, initialOrdersState);

  const listOrders = useCallback(
    async (params?: {
      page?: number;
      pageSize?: number;

      deliveryStatus?: string | string[];
      paymentStatus?: string | string[];
      orderSource?: "all" | "imported" | "website" | (string & {});
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

            deliveryStatus: params?.deliveryStatus,
            paymentStatus: params?.paymentStatus,
            orderSource: params?.orderSource,
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
      deliveryStatus:
        | "ordered"
        | "dispatched"
        | "in_transit"
        | "delivered"
        | "returned",
      deliveryProofFile?: File,
      deliveryNote?: string,
    ) => {
      dispatch({ type: ORDERS_REQUEST });
      try {
        console.log(
          "Updating order",
          orderId,
          "to deliveryStatus",
          deliveryStatus,
        );

        const url = `/admin/orders/${orderId}/status`;
        const cleanedNote =
          typeof deliveryNote === "string" ? deliveryNote.trim() : "";
        const res = deliveryProofFile
          ? await api.put(
              url,
              (() => {
                const fd = new FormData();
                fd.append("deliveryStatus", deliveryStatus);
                fd.append("deliveryProof", deliveryProofFile);
                if (cleanedNote) fd.append("deliveryNote", cleanedNote);
                return fd;
              })(),
              {
                headers: { "Content-Type": "multipart/form-data" },
              },
            )
          : await api.put(url, {
              deliveryStatus,
              ...(cleanedNote ? { deliveryNote: cleanedNote } : {}),
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

  const updateOrderPaymentStatus = useCallback(
    async (orderId: string, paid: boolean) => {
      dispatch({ type: ORDERS_REQUEST });
      try {
        const res = await api.patch(`/admin/orders/${orderId}/payment`, {
          paid,
        });

        const order = unwrapData<AdminOrder>(res.data);
        if (!order?._id) throw new Error("Failed to update payment status");

        dispatch({ type: ORDERS_UPDATE_SUCCESS, payload: { order } });
        return order;
      } catch (err: any) {
        const msg =
          err?.response?.data?.message || "Failed to update payment status";
        dispatch({ type: ORDERS_FAILURE, payload: msg });
        throw err;
      }
    },
    [],
  );

  const updateOrderItems = useCallback(
    async (
      orderId: string,
      items: { variantId: string; quantity: number }[],
    ) => {
      dispatch({ type: ORDERS_REQUEST });
      try {
        const res = await api.patch(`/admin/orders/${orderId}/items`, {
          items,
        });

        const order = unwrapData<AdminOrder>(res.data);
        if (!order?._id) throw new Error("Failed to update order items");

        dispatch({ type: ORDERS_UPDATE_SUCCESS, payload: { order } });
        return order;
      } catch (err: any) {
        const msg =
          err?.response?.data?.message || "Failed to update order items";
        dispatch({ type: ORDERS_FAILURE, payload: msg });
        throw err;
      }
    },
    [],
  );

  const deleteOrder = useCallback(async (orderId: string) => {
    dispatch({ type: ORDERS_REQUEST });
    try {
      const res = await api.delete(`/admin/orders/${orderId}`);
      const data = unwrapData<{ deleted: true; orderId: string }>(res.data);
      if (!data?.deleted) throw new Error("Failed to delete order");
      return data;
    } catch (err: any) {
      const msg = err?.response?.data?.message || "Failed to delete order";
      dispatch({ type: ORDERS_FAILURE, payload: msg });
      throw err;
    }
  }, []);

  const bulkDeleteOrders = useCallback(async (orderIds: string[]) => {
    dispatch({ type: ORDERS_REQUEST });
    try {
      const res = await api.delete("/admin/orders/bulk", {
        data: { orderIds },
      });
      const data = unwrapData<{ matched: number; deleted: number }>(res.data);
      if (!data || typeof data.deleted !== "number") {
        throw new Error("Failed to delete orders");
      }
      return data;
    } catch (err: any) {
      const msg = err?.response?.data?.message || "Failed to delete orders";
      dispatch({ type: ORDERS_FAILURE, payload: msg });
      throw err;
    }
  }, []);

  const bulkUpdateDeliveryStatus = useCallback(
    async (
      orderIds: string[],
      deliveryStatus:
        | "ordered"
        | "dispatched"
        | "in_transit"
        | "delivered"
        | "returned",
    ) => {
      dispatch({ type: ORDERS_REQUEST });

      try {
        const res = await api.put("/admin/orders/bulk/delivery-status", {
          orderIds,
          deliveryStatus,
        });

        const data = unwrapData<{ matched: number; modified: number }>(
          res.data,
        );
        if (!data) throw new Error("Bulk update failed");

        // ✅ optimistic patch: update local list + current order
        dispatch({
          type: ORDERS_BULK_UPDATE_SUCCESS,
          payload: {
            orderIds,
            patch: { deliveryStatus },
          },
        });

        return data;
      } catch (err: any) {
        const msg = err?.response?.data?.message || "Bulk update failed";
        dispatch({ type: ORDERS_FAILURE, payload: msg });
        throw err;
      }
    },
    [],
  );

  const bulkAssignDeliveryDate = useCallback(
    async (orderIds: string[], deliveryDate: string) => {
      dispatch({ type: ORDERS_REQUEST });

      try {
        const res = await api.patch("/admin/orders/assign-delivery-date-bulk", {
          orderIds,
          deliveryDate,
        });

        const data = unwrapData<{ matched: number; modified: number }>(
          res.data,
        );
        if (!data) throw new Error("Bulk assign delivery date failed");

        dispatch({
          type: ORDERS_BULK_UPDATE_SUCCESS,
          payload: {
            orderIds,
            patch: { deliveryDate },
          },
        });

        return data;
      } catch (err: any) {
        const msg =
          err?.response?.data?.message || "Bulk assign delivery date failed";
        dispatch({ type: ORDERS_FAILURE, payload: msg });
        throw err;
      }
    },
    [],
  );

  const refundOrder = useCallback(
    async (
      orderId: string,
      body?: { amount?: number; reason?: string; restock?: boolean },
    ) => {
      dispatch({ type: ORDERS_REQUEST });
      try {
        const res = await api.post(`/admin/orders/${orderId}/refund`, {
          amount: body?.amount,
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

  const getOrdersStockRequirements = useCallback(
    async (params: { orderIds?: string[]; ordersFile?: File }) => {
      try {
        const orderIds = Array.isArray(params?.orderIds) ? params.orderIds : [];
        const file = params?.ordersFile;

        const res = file
          ? await api.post(
              "/admin/delivery/orders/stock",
              (() => {
                const fd = new FormData();
                if (orderIds.length)
                  fd.append("orderIds", JSON.stringify(orderIds));
                fd.append("ordersFile", file);
                return fd;
              })(),
              {
                headers: { "Content-Type": "multipart/form-data" },
              },
            )
          : await api.post("/admin/delivery/orders/stock", { orderIds });

        const data = unwrapData<OrdersStockRequirements>(res.data);
        if (!data || !Array.isArray((data as any).items)) {
          throw new Error("Invalid stock requirements response");
        }
        return data;
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          "Failed to calculate stock requirements";
        throw new Error(msg);
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
      updateOrderPaymentStatus,
      updateOrderItems,
      deleteOrder,
      bulkDeleteOrders,
      refundOrder,
      bulkUpdateDeliveryStatus,
      bulkAssignDeliveryDate,
      getOrdersStockRequirements,
    }),
    [
      state,
      listOrders,
      getOrderById,
      updateOrderStatus,
      updateOrderPaymentStatus,
      updateOrderItems,
      deleteOrder,
      bulkDeleteOrders,
      refundOrder,
      bulkUpdateDeliveryStatus,
      bulkAssignDeliveryDate,
      getOrdersStockRequirements,
    ],
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
