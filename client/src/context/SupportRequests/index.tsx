import {
  createContext,
  useContext,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import api from "../api";

export type SupportRequest = {
  _id: string;
  customer:
    | {
        _id: string;
        firstName: string;
        lastName: string;
        email: string;
        phone?: string | null;
      }
    | string;
  issueType: string;
  subject: string;
  message: string;
  status: "open" | "in_review" | "resolved" | "closed";
  relatedOrder?: { _id: string; orderId: string; status: string } | null;
  relatedSubscription?: {
    _id: string;
    subscriptionNumber: string;
    status: string;
  } | null;
  assignedTo?: { _id: string; name: string; email: string } | null;
  notes?: Array<{
    _id: string;
    author: { _id: string; name: string };
    content: string;
    isInternal: boolean;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

type SupportMeta = { page: number; pageSize: number; total: number };

type SupportContextType = {
  requests: SupportRequest[];
  meta: SupportMeta | null;
  loading: boolean;
  error: string | null;
  listRequests: (params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    search?: string;
  }) => Promise<void>;
  updateStatus: (id: string, status: string) => Promise<void>;
  addNote: (id: string, content: string, isInternal?: boolean) => Promise<void>;
};

const SupportContext = createContext<SupportContextType | null>(null);

export const SupportRequestsProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [meta, setMeta] = useState<SupportMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listRequests = useCallback(
    async (params?: {
      page?: number;
      pageSize?: number;
      status?: string;
      search?: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get("/admin/support-requests", { params });
        const data = res.data?.data ?? res.data;
        setRequests(data?.requests ?? []);
        setMeta(data?.meta ?? null);
      } catch (e: any) {
        setError(
          e?.response?.data?.message ?? "Failed to load support requests",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const updateStatus = useCallback(async (id: string, status: string) => {
    await api.patch(`/admin/support-requests/${id}`, { status });
    setRequests((prev) =>
      prev.map((r) => (r._id === id ? { ...r, status: status as any } : r)),
    );
  }, []);

  const addNote = useCallback(
    async (id: string, content: string, isInternal = true) => {
      await api.post(`/admin/support-requests/${id}/notes`, {
        content,
        isInternal,
      });
    },
    [],
  );

  return (
    <SupportContext.Provider
      value={{
        requests,
        meta,
        loading,
        error,
        listRequests,
        updateStatus,
        addNote,
      }}
    >
      {children}
    </SupportContext.Provider>
  );
};

export const useSupportRequests = () => {
  const ctx = useContext(SupportContext);
  if (!ctx)
    throw new Error(
      "useSupportRequests must be used within SupportRequestsProvider",
    );
  return ctx;
};
