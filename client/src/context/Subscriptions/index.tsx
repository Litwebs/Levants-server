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
  pauseSubscription: (id: string) => Promise<void>;
  resumeSubscription: (id: string) => Promise<void>;
  cancelSubscription: (id: string, reason?: string) => Promise<void>;
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
    await api.post(`/admin/subscriptions/${id}/pause`);
    setSubscriptions((prev) =>
      prev.map((s) => (s._id === id ? { ...s, status: "paused" } : s)),
    );
  }, []);

  const resumeSubscription = useCallback(async (id: string) => {
    await api.post(`/admin/subscriptions/${id}/resume`);
    setSubscriptions((prev) =>
      prev.map((s) => (s._id === id ? { ...s, status: "active" } : s)),
    );
  }, []);

  const cancelSubscription = useCallback(
    async (id: string, reason?: string) => {
      await api.post(`/admin/subscriptions/${id}/cancel`, { reason });
      setSubscriptions((prev) =>
        prev.map((s) => (s._id === id ? { ...s, status: "cancelled" } : s)),
      );
    },
    [],
  );

  return (
    <SubscriptionsContext.Provider
      value={{
        subscriptions,
        meta,
        loading,
        error,
        listSubscriptions,
        pauseSubscription,
        resumeSubscription,
        cancelSubscription,
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
