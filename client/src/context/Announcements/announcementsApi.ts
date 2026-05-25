import api from "@/context/api";
import type {
  Announcement,
  CreateAnnouncementBody,
  ListAnnouncementsMeta,
  UpdateAnnouncementBody,
} from "./types";

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  message?: string;
  meta?: ListAnnouncementsMeta;
};

const unwrap = <T,>(payload: unknown): T | null => {
  if (!payload || typeof payload !== "object") return null;
  const env = payload as ApiEnvelope<T>;
  if ("data" in env) return (env.data ?? null) as T | null;
  return payload as T;
};

export async function listAnnouncements(params?: {
  page?: number;
  pageSize?: number;
}) {
  const res = await api.get("/admin/announcements", { params });
  const data = unwrap<{ announcements: Announcement[] }>(res.data);
  const announcements = data?.announcements ?? [];
  const meta = (res.data as ApiEnvelope<any>)?.meta;
  return { announcements, meta };
}

export async function createAnnouncement(body: CreateAnnouncementBody) {
  const res = await api.post("/admin/announcements", body);
  const data = unwrap<{ announcement: Announcement }>(res.data);
  if (!data?.announcement) throw new Error("Failed to create announcement");
  return data.announcement;
}

export async function updateAnnouncement(
  announcementId: string,
  body: UpdateAnnouncementBody,
) {
  const res = await api.patch(`/admin/announcements/${announcementId}`, body);
  const data = unwrap<{ announcement: Announcement }>(res.data);
  if (!data?.announcement) throw new Error("Failed to update announcement");
  return data.announcement;
}

export async function deleteAnnouncement(announcementId: string) {
  const res = await api.delete(`/admin/announcements/${announcementId}`);
  const data = unwrap<{ announcement: Announcement }>(res.data);
  if (!data?.announcement) throw new Error("Failed to delete announcement");
  return data.announcement;
}
