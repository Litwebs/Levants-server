import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Announcement,
  CreateAnnouncementBody,
  ListAnnouncementsMeta,
  UpdateAnnouncementBody,
} from "@/context/Announcements";
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  updateAnnouncement,
} from "@/context/Announcements";

type State = {
  announcements: Announcement[];
  meta: ListAnnouncementsMeta | null;
  loading: boolean;
  error: string | null;
  creating: boolean;
  deletingId: string | null;
  updatingId: string | null;
};

export function useAnnouncements(initial?: { page?: number; pageSize?: number }) {
  const [page, setPage] = useState<number>(initial?.page ?? 1);
  const [pageSize, setPageSize] = useState<number>(initial?.pageSize ?? 20);

  const [state, setState] = useState<State>({
    announcements: [],
    meta: null,
    loading: true,
    error: null,
    creating: false,
    deletingId: null,
    updatingId: null,
  });

  const fetch = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await listAnnouncements({ page, pageSize });
      setState((s) => ({
        ...s,
        announcements: res.announcements,
        meta: res.meta ?? null,
        loading: false,
      }));
    } catch (err: any) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err?.response?.data?.message || err?.message || "Failed to load announcements",
      }));
    }
  }, [page, pageSize]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const handleCreate = useCallback(
    async (body: CreateAnnouncementBody) => {
      setState((s) => ({ ...s, creating: true }));
      try {
        await createAnnouncement(body);
        await fetch();
        setState((s) => ({ ...s, creating: false }));
        return true;
      } catch (err: any) {
        setState((s) => ({ ...s, creating: false }));
        throw err;
      }
    },
    [fetch],
  );

  const handleUpdate = useCallback(
    async (announcementId: string, body: UpdateAnnouncementBody) => {
      setState((s) => ({ ...s, updatingId: announcementId }));
      try {
        await updateAnnouncement(announcementId, body);
        await fetch();
      } finally {
        setState((s) => ({ ...s, updatingId: null }));
      }
    },
    [fetch],
  );

  const handleDelete = useCallback(
    async (announcementId: string) => {
      setState((s) => ({ ...s, deletingId: announcementId }));
      try {
        await deleteAnnouncement(announcementId);
        await fetch();
      } finally {
        setState((s) => ({ ...s, deletingId: null }));
      }
    },
    [fetch],
  );

  const totalPages = useMemo(() => state.meta?.totalPages ?? 1, [state.meta]);

  return {
    ...state,
    page,
    pageSize,
    totalPages,
    setPage,
    setPageSize,
    refetch: fetch,
    create: handleCreate,
    update: handleUpdate,
    remove: handleDelete,
  };
}
