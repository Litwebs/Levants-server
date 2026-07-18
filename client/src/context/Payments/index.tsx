import {
  createContext,
  useContext,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import api from "../api";

export type Payment = {
  _id: string;
  customer:
    | { _id: string; firstName: string; lastName: string; email: string }
    | string;
  order?: {
    _id: string;
    orderId: string;
    status: string;
    total: number;
  } | null;
  subscription?: { _id: string; subscriptionNumber: string } | null;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "failed" | "refunded";
  notes?: string | null;
  paidAt?: string | null;
  failedAt?: string | null;
  refundedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type PaymentsMeta = { page: number; pageSize: number; total: number };

type PaymentsContextType = {
  payments: Payment[];
  meta: PaymentsMeta | null;
  loading: boolean;
  error: string | null;
  listPayments: (params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    customerId?: string;
  }) => Promise<void>;
  updatePaymentStatus: (
    id: string,
    status: string,
    notes?: string,
  ) => Promise<void>;
};

const PaymentsContext = createContext<PaymentsContextType | null>(null);

export const PaymentsProvider = ({ children }: { children: ReactNode }) => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [meta, setMeta] = useState<PaymentsMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listPayments = useCallback(
    async (params?: {
      page?: number;
      pageSize?: number;
      status?: string;
      customerId?: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get("/admin/payments", { params });
        const data = res.data?.data ?? res.data;
        setPayments(data?.payments ?? []);
        setMeta(data?.meta ?? null);
      } catch (e: any) {
        setError(e?.response?.data?.message ?? "Failed to load payments");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const updatePaymentStatus = useCallback(
    async (id: string, status: string, notes?: string) => {
      await api.patch(`/admin/payments/${id}`, { status, notes });
      setPayments((prev) =>
        prev.map((p) => (p._id === id ? { ...p, status: status as any } : p)),
      );
    },
    [],
  );

  return (
    <PaymentsContext.Provider
      value={{
        payments,
        meta,
        loading,
        error,
        listPayments,
        updatePaymentStatus,
      }}
    >
      {children}
    </PaymentsContext.Provider>
  );
};

export const usePayments = () => {
  const ctx = useContext(PaymentsContext);
  if (!ctx) throw new Error("usePayments must be used within PaymentsProvider");
  return ctx;
};
