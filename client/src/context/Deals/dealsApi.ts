import api from "@/context/api";
import type { Deal, DealDraft, DealsMeta } from "./types";

type Envelope<T> = {
  success: boolean;
  data?: T;
  message?: string;
  meta?: DealsMeta;
};

const unwrap = <T,>(payload: unknown): T | null => {
  if (!payload || typeof payload !== "object") return null;
  const envelope = payload as Envelope<T>;
  return "data" in envelope ? (envelope.data ?? null) : (payload as T);
};

export async function listDeals(params?: { page?: number; pageSize?: number }) {
  const res = await api.get("/admin/deals", { params });
  const data = unwrap<{ deals: Deal[] }>(res.data);
  return {
    deals: data?.deals ?? [],
    meta: (res.data as Envelope<unknown>)?.meta,
  };
}

export async function createDeal(body: DealDraft) {
  const res = await api.post("/admin/deals", body);
  const data = unwrap<{ deal: Deal }>(res.data);
  if (!data?.deal) throw new Error("Failed to create deal");
  return data.deal;
}

export async function updateDeal(id: string, body: Partial<DealDraft>) {
  const res = await api.patch("/admin/deals/" + id, body);
  const data = unwrap<{ deal: Deal }>(res.data);
  if (!data?.deal) throw new Error("Failed to update deal");
  return data.deal;
}

export async function deactivateDeal(id: string) {
  const res = await api.delete("/admin/deals/" + id);
  const data = unwrap<{ deal: Deal }>(res.data);
  if (!data?.deal) throw new Error("Failed to deactivate deal");
  return data.deal;
}
