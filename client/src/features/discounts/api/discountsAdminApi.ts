import api from "@/context/api";
import type {
  CreateDiscountBody,
  Discount,
  DiscountDetails,
  ListDiscountsMeta,
  ListDiscountsResponse,
} from "../types";

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  message?: string;
  meta?: any;
};

const unwrapData = <T,>(payload: unknown): T | null => {
  if (!payload || typeof payload !== "object") return null;
  const maybeEnvelope = payload as ApiEnvelope<T>;
  if ("data" in maybeEnvelope) return (maybeEnvelope.data ?? null) as T | null;
  return payload as T;
};

export async function listDiscounts(params?: {
  page?: number;
  pageSize?: number;
}) {
  const res = await api.get("/admin/discounts", { params });
  const data = unwrapData<ListDiscountsResponse>(res.data);
  const discounts = data?.discounts ?? [];

  const meta = (res.data as ApiEnvelope<any>)?.meta as
    | ListDiscountsMeta
    | undefined;

  return { discounts, meta };
}

export async function createDiscount(body: CreateDiscountBody) {
  const res = await api.post("/admin/discounts", body);
  const data = unwrapData<{ discount: Discount }>(res.data);
  if (!data?.discount) throw new Error("Failed to create discount");
  return data.discount;
}

export async function deactivateDiscount(discountId: string) {
  const res = await api.delete(`/admin/discounts/${discountId}`);
  const data = unwrapData<{ discount: Discount }>(res.data);
  if (!data?.discount) throw new Error("Failed to deactivate discount");
  return data.discount;
}

export async function getDiscountDetails(
  discountId: string,
  params?: { page?: number; pageSize?: number },
) {
  const res = await api.get(`/admin/discounts/${discountId}`, { params });
  const data = unwrapData<DiscountDetails>(res.data);
  if (!data) throw new Error("Failed to load discount details");

  const meta = (res.data as ApiEnvelope<any>)?.meta as
    | ListDiscountsMeta
    | undefined;

  return { details: data, meta };
}
