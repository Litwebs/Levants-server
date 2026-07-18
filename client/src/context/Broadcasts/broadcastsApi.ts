import api from "@/context/api";

export interface Broadcast {
  _id: string;
  title: string;
  description: string;
  isActive: boolean;
  expiresAt?: string;
  emailStatus: "not_sent" | "sending" | "sent" | "failed" | "partial";
  emailedAt?: string;
  emailStats?: {
    totalRecipients: number;
    sent: number;
    failed: number;
    lastError?: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface BroadcastResponse {
  broadcasts: Broadcast[];
}

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  message?: string;
  meta?: unknown;
};

const unwrap = <T,>(payload: unknown): T | null => {
  if (!payload || typeof payload !== "object") return null;
  const env = payload as ApiEnvelope<T>;
  if ("data" in env) return (env.data ?? null) as T | null;
  return payload as T;
};

export const getBroadcasts = async (
  page = 1,
  pageSize = 20,
): Promise<BroadcastResponse> => {
  const res = await api.get("/admin/broadcasts", {
    params: { page, pageSize },
  });

  const data = unwrap<BroadcastResponse>(res.data);
  return { broadcasts: data?.broadcasts ?? [] };
};

export const createBroadcast = async (
  payload: Partial<Broadcast>,
): Promise<Broadcast> => {
  const res = await api.post("/admin/broadcasts", payload);
  const data = unwrap<{ broadcast: Broadcast }>(res.data);
  if (!data?.broadcast) throw new Error("Failed to create broadcast");
  return data.broadcast;
};

export const updateBroadcast = async (
  id: string,
  payload: Partial<Broadcast>,
): Promise<Broadcast> => {
  const res = await api.patch(`/admin/broadcasts/${id}`, payload);
  const data = unwrap<{ broadcast: Broadcast }>(res.data);
  if (!data?.broadcast) throw new Error("Failed to update broadcast");
  return data.broadcast;
};

export const deleteBroadcast = async (id: string): Promise<void> => {
  await api.delete(`/admin/broadcasts/${id}`);
};

export const sendBroadcast = async (id: string): Promise<void> => {
  await api.post(`/admin/broadcasts/${id}/send`);
};

export const getActiveBroadcast = async (): Promise<Broadcast | null> => {
  const res = await api.get("/admin/broadcasts/active");
  const data = unwrap<{ broadcast: Broadcast | null }>(res.data);
  return data?.broadcast ?? null;
};