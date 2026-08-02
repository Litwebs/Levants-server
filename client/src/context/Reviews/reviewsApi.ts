import api from "@/context/api";
import type {
  Review,
  ListReviewsMeta,
  CreateReviewBody,
  UpdateReviewVisibilityBody,
} from "./types";

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  message?: string;
  meta?: ListReviewsMeta;
};

const unwrap = <T,>(payload: unknown): T | null => {
  if (!payload || typeof payload !== "object") return null;
  const env = payload as ApiEnvelope<T>;
  if ("data" in env) return (env.data ?? null) as T | null;
  return payload as T;
};

export async function verifyOrderId(orderId: string) {
  const res = await api.get(`/reviews/verify/${encodeURIComponent(orderId)}`);
  return (res.data as ApiEnvelope<null>).success === true;
}

export async function submitReview(body: CreateReviewBody) {
  const form = new FormData();
  form.append("orderId", body.orderId);
  form.append("customerName", body.customerName);
  form.append("description", body.description);
  form.append("rating", String(body.rating));
  if (body.image) {
    form.append("image", body.image);
  }

  const res = await api.post("/reviews", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  const data = unwrap<{ review: Review }>(res.data);
  if (!data?.review) throw new Error("Failed to submit review");
  return data.review;
}

export async function listPublicReviews(params?: {
  page?: number;
  pageSize?: number;
}) {
  const res = await api.get("/reviews", { params });
  const data = unwrap<{ reviews: Review[] }>(res.data);
  const reviews = data?.reviews ?? [];
  const meta = (res.data as ApiEnvelope<any>)?.meta;
  return { reviews, meta };
}

// Admin

export async function listReviewsAdmin(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  visibility?: "all" | "visible" | "hidden";
  rating?: "all" | "1" | "2" | "3" | "4" | "5";
  sort?: "newest" | "oldest" | "rating-high" | "rating-low";
}) {
  const res = await api.get("/admin/reviews", { params });
  const data = unwrap<{ reviews: Review[] }>(res.data);
  const reviews = data?.reviews ?? [];
  const meta = (res.data as ApiEnvelope<any>)?.meta;
  return { reviews, meta };
}

export async function bulkDeleteReviews(ids: string[]) {
  const res = await api.delete("/admin/reviews/bulk", { data: { ids } });
  return (res.data as ApiEnvelope<{ deleted: number }>).data ?? null;
}

export async function bulkUpdateVisibility(ids: string[], isVisible: boolean) {
  const res = await api.patch("/admin/reviews/bulk/visibility", { ids, isVisible });
  return (res.data as ApiEnvelope<{ updated: number }>).data ?? null;
}

export async function updateReviewVisibility(
  reviewId: string,
  body: UpdateReviewVisibilityBody,
) {
  const res = await api.patch(`/admin/reviews/${reviewId}`, body);
  const data = unwrap<{ review: Review }>(res.data);
  if (!data?.review) throw new Error("Failed to update review");
  return data.review;
}

export async function deleteReview(reviewId: string) {
  const res = await api.delete(`/admin/reviews/${reviewId}`);
  const data = unwrap<{ review: Review }>(res.data);
  if (!data?.review) throw new Error("Failed to delete review");
  return data.review;
}
