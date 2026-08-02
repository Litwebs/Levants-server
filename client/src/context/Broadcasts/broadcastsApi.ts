import api from "@/context/api";

export interface BroadcastAudience {
  customerTypes: Array<"guest" | "account">;
  joinedFrom?: string;
  joinedTo?: string;
  lastOrderFrom?: string;
  lastOrderTo?: string;
  postcodes: string[];
  marketingPreference: "any" | "opted_in" | "opted_out";
  orderStatuses: string[];
  deliveryStatuses: string[];
  orderTypes: Array<"one_time" | "subscription_generated">;
  orderedFrom?: string;
  orderedTo?: string;
  productIds: string[];
  variantIds: string[];
  hasSubscription: "any" | "yes" | "no";
  subscriptionStatuses: Array<"active" | "paused" | "cancelled">;
  subscriptionFrequencies: Array<
    "weekly" | "every_two_weeks" | "monthly"
  >;
  deliveryDays: number[];
}

export interface AudiencePreview {
  totalRecipients: number;
  breakdown: {
    guests: number;
    accounts: number;
    marketingOptIn: number;
  };
  sample: Array<{
    customerId: string;
    firstName: string;
    lastName: string;
    email: string;
  }>;
  filters: BroadcastAudience;
}

export interface BroadcastAudienceOptions {
  products: Array<{ _id: string; name: string; status: string }>;
  variants: Array<{
    _id: string;
    product: string;
    productName: string;
    name: string;
    sku: string;
    status: string;
  }>;
}

export interface Broadcast {
  _id: string;
  title: string;
  description: string;
  messageType: "operational" | "marketing";
  audience: BroadcastAudience;
  audienceSummary?: {
    estimatedRecipients: number;
    guests: number;
    accounts: number;
    marketingOptIn: number;
    calculatedAt?: string;
  };
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

export const previewBroadcastAudience = async (
  audience: Partial<BroadcastAudience>,
  messageType: Broadcast["messageType"],
): Promise<AudiencePreview> => {
  const res = await api.post("/admin/broadcasts/audience-preview", {
    audience,
    messageType,
  });
  const data = unwrap<AudiencePreview>(res.data);
  if (!data) throw new Error("Failed to preview audience");
  return data;
};

export const getBroadcastAudienceOptions = async (): Promise<BroadcastAudienceOptions> => {
  const res = await api.get("/admin/broadcasts/audience-options");
  const data = unwrap<BroadcastAudienceOptions>(res.data);
  return data ?? { products: [], variants: [] };
};

export const getActiveBroadcast = async (): Promise<Broadcast | null> => {
  const res = await api.get("/admin/broadcasts/active");
  const data = unwrap<{ broadcast: Broadcast | null }>(res.data);
  return data?.broadcast ?? null;
};
