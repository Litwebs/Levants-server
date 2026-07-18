import {
  createContext,
  useContext,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import api from "../api";

export type SubscriptionItem = {
  _id: string;
  product: string;
  variant: string;
  name: string;
  sku: string;
  imageUrl?: string | null;
  quantity: number;
  unitPrice: number;
};

export type Subscription = {
  _id: string;
  subscriptionNumber: string;
  customer:
    | {
        _id: string;
        firstName: string;
        lastName: string;
        email: string;
        phone?: string | null;
      }
    | string;
  status: "active" | "paused" | "cancelled";
  frequency: "weekly" | "every_two_weeks" | "monthly";
  preferredDeliveryDay: number;
  nextDeliveryDate: string;
  startDate: string;
  items: SubscriptionItem[];
  deliveryAddress: {
    line1: string;
    line2?: string | null;
    city: string;
    postcode: string;
    country: string;
    deliveryInstructions?: string | null;
  };
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  pausedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
};

export type SubscriptionDelivery = {
  _id: string;
  scheduledDate: string;
  status: string;
  generatedAt?: string | null;
  failReason?: string | null;
  createdAt: string;
  order?: {
    _id: string;
    orderId?: string;
    status?: string;
    deliveryStatus?: string;
    total?: number;
  } | null;
};

export type SubscriptionOrder = {
  _id: string;
  orderId?: string;
  status?: string;
  deliveryStatus?: string;
  total?: number;
  createdAt?: string;
  deliveryDate?: string | null;
};

export type SubscriptionManageResult = {
  subscription: Subscription;
};

export type SubscriptionPayment = {
  _id: string;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "failed" | "refunded" | string;
  createdAt: string;
  paidAt?: string | null;
  failedAt?: string | null;
  refundedAt?: string | null;
  providerReference?: string | null;
  notes?: string | null;
  order?: {
    _id: string;
    orderId?: string;
    status?: string;
    total?: number;
  } | null;
};

type SubscriptionsMeta = {
  page: number;
  pageSize: number;
  total: number;
};

type SubscriptionsContextType = {
  subscriptions: Subscription[];
  meta: SubscriptionsMeta | null;
  loading: boolean;
  error: string | null;
  listSubscriptions: (params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    frequency?: string;
    search?: string;
  }) => Promise<void>;
  getSubscription: (id: string) => Promise<Subscription>;
  getSubscriptionDeliveries: (
    id: string,
    params?: { page?: number; pageSize?: number },
  ) => Promise<{
    deliveries: SubscriptionDelivery[];
    meta: SubscriptionsMeta | null;
  }>;
  getSubscriptionOrders: (
    id: string,
    params?: { page?: number; pageSize?: number },
  ) => Promise<{ orders: SubscriptionOrder[]; meta: SubscriptionsMeta | null }>;
  getSubscriptionPayments: (
    id: string,
    params?: { page?: number; pageSize?: number; status?: string },
  ) => Promise<{
    payments: SubscriptionPayment[];
    meta: SubscriptionsMeta | null;
  }>;
  updateSubscription: (
    id: string,
    payload: {
      frequency?: string;
      preferredDeliveryDay?: number;
      notes?: string | null;
    },
  ) => Promise<Subscription>;
  pauseSubscription: (id: string) => Promise<Subscription>;
  resumeSubscription: (id: string) => Promise<Subscription>;
  cancelSubscription: (id: string, reason?: string) => Promise<Subscription>;
  addSubscriptionItem: (
    id: string,
    payload: { variantId: string; quantity: number },
  ) => Promise<Subscription>;
  updateSubscriptionItem: (
    id: string,
    itemId: string,
    payload: { quantity: number },
  ) => Promise<Subscription>;
  removeSubscriptionItem: (id: string, itemId: string) => Promise<Subscription>;
};

const SubscriptionsContext = createContext<SubscriptionsContextType | null>(
  null,
);

export const SubscriptionsProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [meta, setMeta] = useState<SubscriptionsMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listSubscriptions = useCallback(
    async (params?: {
      page?: number;
      pageSize?: number;
      status?: string;
      frequency?: string;
      search?: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get("/admin/subscriptions", { params });
        const data = res.data?.data ?? res.data;
        setSubscriptions(data?.subscriptions ?? []);
        setMeta(data?.meta ?? null);
      } catch (e: any) {
        setError(e?.response?.data?.message ?? "Failed to load subscriptions");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const pauseSubscription = useCallback(async (id: string) => {
    const res = await api.post(`/admin/subscriptions/${id}/pause`);
    const next = (res.data?.data ?? res.data)?.subscription as
      | Subscription
      | undefined;
    if (next?._id) {
      setSubscriptions((prev) => prev.map((s) => (s._id === id ? next : s)));
      return next;
    }
    const fallback = { _id: id, status: "paused" as const } as Subscription;
    setSubscriptions((prev) =>
      prev.map((s) => (s._id === id ? { ...s, status: "paused" } : s)),
    );
    return fallback;
  }, []);

  const resumeSubscription = useCallback(async (id: string) => {
    const res = await api.post(`/admin/subscriptions/${id}/resume`);
    const next = (res.data?.data ?? res.data)?.subscription as
      | Subscription
      | undefined;
    if (next?._id) {
      setSubscriptions((prev) => prev.map((s) => (s._id === id ? next : s)));
      return next;
    }
    const fallback = { _id: id, status: "active" as const } as Subscription;
    setSubscriptions((prev) =>
      prev.map((s) => (s._id === id ? { ...s, status: "active" } : s)),
    );
    return fallback;
  }, []);

  const cancelSubscription = useCallback(
    async (id: string, reason?: string) => {
      const res = await api.post(`/admin/subscriptions/${id}/cancel`, {
        reason,
      });
      const next = (res.data?.data ?? res.data)?.subscription as
        | Subscription
        | undefined;
      if (next?._id) {
        setSubscriptions((prev) => prev.map((s) => (s._id === id ? next : s)));
        return next;
      }
      const fallback = {
        _id: id,
        status: "cancelled" as const,
      } as Subscription;
      setSubscriptions((prev) =>
        prev.map((s) => (s._id === id ? { ...s, status: "cancelled" } : s)),
      );
      return fallback;
    },
    [],
  );

  const getSubscription = useCallback(async (id: string) => {
    const res = await api.get(`/admin/subscriptions/${id}`);
    const data = res.data?.data ?? res.data;
    return data?.subscription as Subscription;
  }, []);

  const getSubscriptionDeliveries = useCallback(
    async (id: string, params?: { page?: number; pageSize?: number }) => {
      const res = await api.get(`/admin/subscriptions/${id}/deliveries`, {
        params,
      });
      const data = res.data?.data ?? res.data;
      return {
        deliveries: (data?.deliveries ?? []) as SubscriptionDelivery[],
        meta: (data?.meta ?? null) as SubscriptionsMeta | null,
      };
    },
    [],
  );

  const getSubscriptionOrders = useCallback(
    async (id: string, params?: { page?: number; pageSize?: number }) => {
      const res = await api.get(`/admin/subscriptions/${id}/orders`, {
        params,
      });
      const data = res.data?.data ?? res.data;
      return {
        orders: (data?.orders ?? []) as SubscriptionOrder[],
        meta: (data?.meta ?? null) as SubscriptionsMeta | null,
      };
    },
    [],
  );

  const getSubscriptionPayments = useCallback(
    async (
      id: string,
      params?: { page?: number; pageSize?: number; status?: string },
    ) => {
      const res = await api.get(`/admin/payments`, {
        params: {
          ...(params || {}),
          subscriptionId: id,
        },
      });
      const data = res.data?.data ?? res.data;
      return {
        payments: (data?.payments ?? []) as SubscriptionPayment[],
        meta: (data?.meta ?? null) as SubscriptionsMeta | null,
      };
    },
    [],
  );

  const updateSubscription = useCallback(
    async (
      id: string,
      payload: {
        frequency?: string;
        preferredDeliveryDay?: number;
        notes?: string | null;
      },
    ) => {
      const res = await api.patch(`/admin/subscriptions/${id}`, payload);
      const data = res.data?.data ?? res.data;
      const next = (data?.subscription ?? null) as Subscription | null;
      if (next?._id) {
        setSubscriptions((prev) => prev.map((s) => (s._id === id ? next : s)));
        return next;
      }
      return getSubscription(id);
    },
    [getSubscription],
  );

  const addSubscriptionItem = useCallback(
    async (id: string, payload: { variantId: string; quantity: number }) => {
      const res = await api.post(`/admin/subscriptions/${id}/items`, payload);
      const data = res.data?.data ?? res.data;
      const next = (data?.subscription ?? null) as Subscription | null;
      if (next?._id) {
        setSubscriptions((prev) => prev.map((s) => (s._id === id ? next : s)));
        return next;
      }
      return getSubscription(id);
    },
    [getSubscription],
  );

  const updateSubscriptionItem = useCallback(
    async (id: string, itemId: string, payload: { quantity: number }) => {
      const res = await api.patch(
        `/admin/subscriptions/${id}/items/${itemId}`,
        payload,
      );
      const data = res.data?.data ?? res.data;
      const next = (data?.subscription ?? null) as Subscription | null;
      if (next?._id) {
        setSubscriptions((prev) => prev.map((s) => (s._id === id ? next : s)));
        return next;
      }
      return getSubscription(id);
    },
    [getSubscription],
  );

  const removeSubscriptionItem = useCallback(
    async (id: string, itemId: string) => {
      const res = await api.delete(
        `/admin/subscriptions/${id}/items/${itemId}`,
      );
      const data = res.data?.data ?? res.data;
      const next = (data?.subscription ?? null) as Subscription | null;
      if (next?._id) {
        setSubscriptions((prev) => prev.map((s) => (s._id === id ? next : s)));
        return next;
      }
      return getSubscription(id);
    },
    [getSubscription],
  );

  return (
    <SubscriptionsContext.Provider
      value={{
        subscriptions,
        meta,
        loading,
        error,
        listSubscriptions,
        getSubscription,
        getSubscriptionDeliveries,
        getSubscriptionOrders,
        getSubscriptionPayments,
        updateSubscription,
        pauseSubscription,
        resumeSubscription,
        cancelSubscription,
        addSubscriptionItem,
        updateSubscriptionItem,
        removeSubscriptionItem,
      }}
    >
      {children}
    </SubscriptionsContext.Provider>
  );
};

export const useSubscriptions = () => {
  const ctx = useContext(SubscriptionsContext);
  if (!ctx)
    throw new Error(
      "useSubscriptions must be used within SubscriptionsProvider",
    );
  return ctx;
};
