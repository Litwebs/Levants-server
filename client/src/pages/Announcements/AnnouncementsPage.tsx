import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardFooter,
  Input,
  Modal,
  ModalFooter,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/common";
import { useToast } from "@/components/common/Toast";
import { usePermissions } from "@/hooks/usePermissions";
import type { CreateAnnouncementBody } from "@/context/Announcements";
import { useAnnouncements } from "./useAnnouncements";
import styles from "./AnnouncementsPage.module.css";

const formatDate = (value?: string) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const isExpired = (expiresAt?: string) => {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
};

const emptyDraft: CreateAnnouncementBody = {
  title: "",
  description: "",
  expiresAt: "",
};

export const AnnouncementsPage = () => {
  const { showToast } = useToast();
  const { hasPermission } = usePermissions();

  const canCreate = hasPermission("announcements.create");
  const canUpdate = hasPermission("announcements.update");
  const canDelete = hasPermission("announcements.delete");

  const {
    announcements,
    loading,
    error,
    creating,
    deletingId,
    updatingId,
    meta,
    page,
    pageSize,
    totalPages,
    setPage,
    create,
    update,
    remove,
  } = useAnnouncements({ page: 1, pageSize: 20 });

  const total = meta?.total ?? 0;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<CreateAnnouncementBody>(emptyDraft);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const handleCreate = async () => {
    const body: CreateAnnouncementBody = {
      title: draft.title.trim(),
    };
    if (draft.description?.trim()) body.description = draft.description.trim();
    if (draft.expiresAt) body.expiresAt = draft.expiresAt;

    try {
      await create(body);
      setCreateOpen(false);
      setDraft(emptyDraft);
      showToast({ message: "Announcement created", type: "success" });
    } catch (err: any) {
      showToast({
        message:
          err?.response?.data?.message || "Failed to create announcement",
        type: "error",
      });
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      await update(id, { isActive: !currentActive });
      showToast({
        message: currentActive
          ? "Announcement deactivated"
          : "Announcement activated",
        type: "success",
      });
    } catch (err: any) {
      showToast({
        message:
          err?.response?.data?.message || "Failed to update announcement",
        type: "error",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await remove(deleteTargetId);
      setDeleteTargetId(null);
      showToast({ message: "Announcement deleted", type: "success" });
    } catch (err: any) {
      showToast({
        message:
          err?.response?.data?.message || "Failed to delete announcement",
        type: "error",
      });
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Announcements</div>
          <div className={styles.subtitle}>
            Manage banners displayed on the customer-facing website. Only one
            announcement can be active at a time.
          </div>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            + New Announcement
          </Button>
        )}
      </div>

      <Card>
        {loading && (
          <div
            style={{
              padding: "var(--space-6)",
              textAlign: "center",
              color: "var(--color-gray-500)",
            }}
          >
            Loading…
          </div>
        )}
        {!loading && error && (
          <div
            style={{ padding: "var(--space-6)", color: "var(--color-red-600)" }}
          >
            {error}
          </div>
        )}
        {!loading && !error && (
          <div className={styles.tableWrapper}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Created</TableHead>
                  {(canUpdate || canDelete) && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {announcements.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <span className={styles.muted}>
                        No announcements yet.
                      </span>
                    </TableCell>
                  </TableRow>
                )}
                {announcements.map((a) => {
                  const expired = isExpired(a.expiresAt);
                  const isUpdating = updatingId === a._id;
                  const isDeleting = deletingId === a._id;

                  return (
                    <TableRow key={a._id}>
                      <TableCell>{a.title}</TableCell>
                      <TableCell>
                        <span className={styles.muted}>
                          {a.description ? a.description : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {expired ? (
                          <Badge variant="error">Expired</Badge>
                        ) : a.isActive ? (
                          <Badge variant="success" dot>
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="default">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {a.expiresAt ? (
                          <span>
                            {formatDate(a.expiresAt)}
                            {expired && (
                              <span className={styles.expiredText}>
                                {" "}
                                (expired)
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className={styles.muted}>No expiry</span>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(a.createdAt)}</TableCell>
                      {(canUpdate || canDelete) && (
                        <TableCell>
                          <div className={styles.actions}>
                            {canUpdate && !expired && (
                              <Button
                                size="sm"
                                variant={a.isActive ? "outline" : "default"}
                                disabled={isUpdating || isDeleting}
                                onClick={() =>
                                  handleToggleActive(a._id, a.isActive)
                                }
                              >
                                {isUpdating
                                  ? "…"
                                  : a.isActive
                                    ? "Deactivate"
                                    : "Set Active"}
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={isDeleting || isUpdating}
                                onClick={() => setDeleteTargetId(a._id)}
                              >
                                {isDeleting ? "…" : "Delete"}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {!loading && totalPages > 1 && (
          <CardFooter>
            <div className={styles.pagination}>
              <span>
                {rangeStart}–{rangeEnd} of {total}
              </span>
              <div className={styles.paginationControls}>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span>
                  {page} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardFooter>
        )}
      </Card>

      {/* Create Modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setDraft(emptyDraft);
        }}
        title="New Announcement"
        size="md"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-4)",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "var(--space-1)",
                fontSize: "var(--text-sm)",
                fontWeight: "var(--font-medium)",
              }}
            >
              Title <span style={{ color: "var(--color-red-500)" }}>*</span>
            </label>
            <Input
              value={draft.title}
              onChange={(e) =>
                setDraft((d) => ({ ...d, title: e.target.value }))
              }
              placeholder="e.g. Bank Holiday closure"
              maxLength={120}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "var(--space-1)",
                fontSize: "var(--text-sm)",
                fontWeight: "var(--font-medium)",
              }}
            >
              Description{" "}
              <span
                style={{
                  color: "var(--color-gray-400)",
                  fontWeight: "var(--font-normal)",
                }}
              >
                (optional, max 500 chars)
              </span>
            </label>
            <textarea
              value={draft.description ?? ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, description: e.target.value }))
              }
              placeholder="Brief details shown below the title…"
              maxLength={500}
              rows={3}
              style={{
                width: "100%",
                padding: "var(--space-2) var(--space-3)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-gray-300)",
                fontSize: "var(--text-sm)",
                resize: "vertical",
                background: "var(--color-white)",
                color: "var(--color-gray-900)",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "var(--space-1)",
                fontSize: "var(--text-sm)",
                fontWeight: "var(--font-medium)",
              }}
            >
              Expiry date{" "}
              <span
                style={{
                  color: "var(--color-gray-400)",
                  fontWeight: "var(--font-normal)",
                }}
              >
                (optional)
              </span>
            </label>
            <Input
              type="datetime-local"
              value={draft.expiresAt ?? ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, expiresAt: e.target.value }))
              }
            />
          </div>
        </div>

        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setCreateOpen(false);
              setDraft(emptyDraft);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={creating || !draft.title.trim()}
          >
            {creating ? "Creating…" : "Create"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        isOpen={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        title="Delete Announcement"
        size="sm"
      >
        <p
          style={{ fontSize: "var(--text-sm)", color: "var(--color-gray-700)" }}
        >
          Are you sure you want to permanently delete this announcement? This
          action cannot be undone.
        </p>
        <ModalFooter>
          <Button variant="outline" onClick={() => setDeleteTargetId(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!!deletingId}
            onClick={handleDelete}
          >
            {deletingId ? "Deleting…" : "Delete"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};
