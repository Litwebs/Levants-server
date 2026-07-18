import { useState } from "react";
import {
  Badge,
  Button,
  Card,
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
import type { Broadcast } from "@/context/Broadcasts/broadcastsApi";
import { useBroadcasts } from "./useBroadcasts";
import styles from "./BroadcastsPage.module.css";

const emptyDraft: Partial<Broadcast> = {
  title: "",
  description: "",
  expiresAt: "",
};

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

const getEmailBadge = (status?: Broadcast["emailStatus"]) => {
  if (status === "sent") return <Badge variant="success">Sent</Badge>;
  if (status === "sending") return <Badge variant="default">Sending</Badge>;
  if (status === "failed") return <Badge variant="error">Failed</Badge>;
  if (status === "partial") return <Badge variant="warning">Partial</Badge>;
  return <Badge variant="default">Not sent</Badge>;
};

export const BroadcastsPage = () => {
  const { showToast } = useToast();
  const { broadcasts, loading, saving, create, update, remove, send } =
    useBroadcasts();

  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<Broadcast>>(emptyDraft);
  const [editTarget, setEditTarget] = useState<Broadcast | null>(null);

  const resetDraft = () => setDraft(emptyDraft);

  const handleCreate = async () => {
    try {
      await create({
        title: draft.title?.trim(),
        description: draft.description?.trim(),
        expiresAt: draft.expiresAt || undefined,
      });

      setCreateOpen(false);
      resetDraft();
      showToast({
        title: "Broadcast created",
        message: "The broadcast was created successfully.",
        type: "success",
      });
    } catch (err: any) {
      showToast({
        title: "Create failed",
        message: err?.response?.data?.message || "Failed to create broadcast",
        type: "error",
      });
    }
  };

  const handleUpdate = async () => {
    if (!editTarget) return;

    try {
      await update(editTarget._id, {
        title: draft.title?.trim(),
        description: draft.description?.trim(),
        expiresAt: draft.expiresAt || undefined,
      });

      setEditTarget(null);
      resetDraft();
      showToast({
        title: "Broadcast updated",
        message: "The broadcast was updated successfully.",
        type: "success",
      });
    } catch (err: any) {
      showToast({
        title: "Update failed",
        message: err?.response?.data?.message || "Failed to update broadcast",
        type: "error",
      });
    }
  };

  const openEdit = (broadcast: Broadcast) => {
    setEditTarget(broadcast);
    setDraft({
      title: broadcast.title,
      description: broadcast.description,
      expiresAt: broadcast.expiresAt || "",
    });
  };

  const handleSend = async (id: string) => {
    try {
      await send(id);
      showToast({
        title: "Broadcast sent",
        message: "The broadcast email was sent successfully.",
        type: "success",
      });
    } catch (err: any) {
      showToast({
        title: "Send failed",
        message: err?.response?.data?.message || "Failed to send broadcast",
        type: "error",
      });
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Broadcasts</div>
          <div className={styles.subtitle}>
            Send operational alerts and service announcements to active
            customers.
          </div>
        </div>

        <Button onClick={() => setCreateOpen(true)}>+ New Broadcast</Button>
      </div>

      <Card>
        {loading ? (
          <div className={styles.loading}>Loading…</div>
        ) : (
          <div className={styles.tableWrapper}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Last sent</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {broadcasts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <span className={styles.muted}>No broadcasts yet.</span>
                    </TableCell>
                  </TableRow>
                )}

                {broadcasts.map((broadcast) => (
                  <TableRow key={broadcast._id}>
                    <TableCell>
                      <div className={styles.broadcastTitle}>
                        {broadcast.title}
                      </div>
                      <div className={styles.muted}>
                        {broadcast.description || "—"}
                      </div>
                    </TableCell>

                    <TableCell>
                      {getEmailBadge(broadcast.emailStatus)}
                    </TableCell>

                    <TableCell>
                      {broadcast.emailStats?.totalRecipients ?? 0} total
                      <div className={styles.muted}>
                        {broadcast.emailStats?.sent ?? 0} sent /{" "}
                        {broadcast.emailStats?.failed ?? 0} failed
                      </div>
                    </TableCell>

                    <TableCell>{formatDate(broadcast.emailedAt)}</TableCell>
                    <TableCell>{formatDate(broadcast.createdAt)}</TableCell>

                    <TableCell>
                      <div className={styles.actions}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(broadcast)}
                          disabled={saving}
                        >
                          Edit
                        </Button>

                        <Button
                          size="sm"
                          onClick={() => handleSend(broadcast._id)}
                          disabled={
                            saving || broadcast.emailStatus === "sending"
                          }
                        >
                          Send
                        </Button>

                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => remove(broadcast._id)}
                          disabled={saving}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Modal
        isOpen={createOpen || !!editTarget}
        onClose={() => {
          setCreateOpen(false);
          setEditTarget(null);
          resetDraft();
        }}
        title={editTarget ? "Edit Broadcast" : "New Broadcast"}
        size="md"
      >
        <div className={styles.form}>
          <Input
            label="Title"
            value={draft.title || ""}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="e.g. Delivery delay update"
            maxLength={120}
          />

          <label className={styles.label}>
            Message
            <textarea
              value={draft.description || ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, description: e.target.value }))
              }
              placeholder="Write the service update customers should receive…"
              rows={6}
              maxLength={2000}
              className={styles.textarea}
            />
          </label>

          <Input
            label="Expiry date optional"
            type="datetime-local"
            value={draft.expiresAt || ""}
            onChange={(e) =>
              setDraft((d) => ({ ...d, expiresAt: e.target.value }))
            }
          />
        </div>

        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setCreateOpen(false);
              setEditTarget(null);
              resetDraft();
            }}
          >
            Cancel
          </Button>

          <Button
            onClick={editTarget ? handleUpdate : handleCreate}
            disabled={saving || !draft.title?.trim()}
          >
            {saving ? "Saving…" : editTarget ? "Save Changes" : "Create"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};
