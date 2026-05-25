import { useRef, useState } from "react";
import {
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
import type {
  CreateCategoryBody,
  UpdateCategoryBody,
} from "@/context/Categories";
import type { Category } from "@/context/Categories";
import { useCategories } from "./useCategories";
import styles from "./CategoriesPage.module.css";

type Draft = {
  title: string;
  subtitle: string;
  imageBase64: string | null;
  imageUrl: string | null;
};

const emptyDraft = (): Draft => ({
  title: "",
  subtitle: "",
  imageBase64: null,
  imageUrl: null,
});

export const CategoriesPage = () => {
  const { showToast } = useToast();
  const { hasPermission } = usePermissions();

  const canCreate = hasPermission("categories.create");
  const canUpdate = hasPermission("categories.update");
  const canDelete = hasPermission("categories.delete");

  const {
    categories,
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
  } = useCategories({ page: 1, pageSize: 50 });

  const total = meta?.total ?? 0;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());

  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft());

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const createFileRef = useRef<HTMLInputElement>(null);
  const editFileRef = useRef<HTMLInputElement>(null);

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleCreateImageChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await readFileAsBase64(file);
    setDraft((d) => ({ ...d, imageBase64: base64, imageUrl: base64 }));
  };

  const handleEditImageChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await readFileAsBase64(file);
    setEditDraft((d) => ({ ...d, imageBase64: base64, imageUrl: base64 }));
  };

  const handleCreate = async () => {
    const body: CreateCategoryBody = {
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim() || undefined,
      image: draft.imageBase64 ?? undefined,
    };

    try {
      await create(body);
      setCreateOpen(false);
      setDraft(emptyDraft());
      showToast({ message: "Category created", type: "success" });
    } catch (err: any) {
      showToast({
        message: err?.response?.data?.message || "Failed to create category",
        type: "error",
      });
    }
  };

  const openEdit = (cat: Category) => {
    setEditTarget(cat);
    setEditDraft({
      title: cat.title,
      subtitle: cat.subtitle || "",
      imageBase64: null,
      imageUrl: cat.image?.url ?? null,
    });
  };

  const handleUpdate = async () => {
    if (!editTarget) return;

    const body: UpdateCategoryBody = {};
    if (editDraft.title.trim() !== editTarget.title)
      body.title = editDraft.title.trim();
    if (editDraft.subtitle.trim() !== (editTarget.subtitle || ""))
      body.subtitle = editDraft.subtitle.trim();
    if (editDraft.imageBase64) body.image = editDraft.imageBase64;

    if (Object.keys(body).length === 0) {
      setEditTarget(null);
      return;
    }

    try {
      await update(editTarget._id, body);
      setEditTarget(null);
      showToast({ message: "Category updated", type: "success" });
    } catch (err: any) {
      showToast({
        message: err?.response?.data?.message || "Failed to update category",
        type: "error",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await remove(deleteTargetId);
      setDeleteTargetId(null);
      showToast({ message: "Category deleted", type: "success" });
    } catch (err: any) {
      showToast({
        message: err?.response?.data?.message || "Failed to delete category",
        type: "error",
      });
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Categories</div>
          <div className={styles.subtitle}>
            Manage product categories displayed on the storefront. Each category
            can have a title, subtitle, and image.
          </div>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>+ New Category</Button>
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
                  <TableHead>Image</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Subtitle</TableHead>
                  {(canUpdate || canDelete) && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <span className={styles.muted}>No categories yet.</span>
                    </TableCell>
                  </TableRow>
                )}
                {categories.map((cat) => {
                  const isUpdating = updatingId === cat._id;
                  const isDeleting = deletingId === cat._id;

                  return (
                    <TableRow key={cat._id}>
                      <TableCell>
                        {cat.image?.url ? (
                          <img
                            src={cat.image.url}
                            alt={cat.title}
                            className={styles.thumbnail}
                          />
                        ) : (
                          <div className={styles.noImage}>No img</div>
                        )}
                      </TableCell>
                      <TableCell>{cat.title}</TableCell>
                      <TableCell>
                        <span className={styles.muted}>
                          {cat.subtitle || "—"}
                        </span>
                      </TableCell>
                      {(canUpdate || canDelete) && (
                        <TableCell className="text-right">
                          <div className={styles.actions}>
                            {canUpdate && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isUpdating || isDeleting}
                                onClick={() => openEdit(cat)}
                              >
                                Edit
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={isDeleting || isUpdating}
                                onClick={() => setDeleteTargetId(cat._id)}
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
          setDraft(emptyDraft());
        }}
        title="New Category"
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
              placeholder="e.g. Dairy"
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
              Subtitle{" "}
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
              value={draft.subtitle}
              onChange={(e) =>
                setDraft((d) => ({ ...d, subtitle: e.target.value }))
              }
              placeholder="e.g. Fresh from Yorkshire farms"
              maxLength={300}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "var(--space-2)",
                fontSize: "var(--text-sm)",
                fontWeight: "var(--font-medium)",
              }}
            >
              Image{" "}
              <span
                style={{
                  color: "var(--color-gray-400)",
                  fontWeight: "var(--font-normal)",
                }}
              >
                (optional)
              </span>
            </label>
            <div className={styles.imageUploadArea}>
              {draft.imageUrl ? (
                <img
                  src={draft.imageUrl}
                  alt="Preview"
                  className={styles.imagePreview}
                  onClick={() => createFileRef.current?.click()}
                  style={{ cursor: "pointer" }}
                />
              ) : (
                <div
                  className={styles.imagePreviewPlaceholder}
                  onClick={() => createFileRef.current?.click()}
                >
                  Click to upload
                </div>
              )}
              <span className={styles.uploadHint}>
                JPG, PNG or WebP recommended
              </span>
              <input
                ref={createFileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleCreateImageChange}
              />
            </div>
          </div>
        </div>

        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setCreateOpen(false);
              setDraft(emptyDraft());
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={!draft.title.trim() || creating}
            onClick={handleCreate}
          >
            {creating ? "Creating…" : "Create"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title="Edit Category"
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
              value={editDraft.title}
              onChange={(e) =>
                setEditDraft((d) => ({ ...d, title: e.target.value }))
              }
              placeholder="e.g. Dairy"
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
              Subtitle{" "}
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
              value={editDraft.subtitle}
              onChange={(e) =>
                setEditDraft((d) => ({ ...d, subtitle: e.target.value }))
              }
              placeholder="e.g. Fresh from Yorkshire farms"
              maxLength={300}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "var(--space-2)",
                fontSize: "var(--text-sm)",
                fontWeight: "var(--font-medium)",
              }}
            >
              Image
            </label>
            <div className={styles.imageUploadArea}>
              {editDraft.imageUrl ? (
                <img
                  src={editDraft.imageUrl}
                  alt="Preview"
                  className={styles.imagePreview}
                  onClick={() => editFileRef.current?.click()}
                  style={{ cursor: "pointer" }}
                />
              ) : (
                <div
                  className={styles.imagePreviewPlaceholder}
                  onClick={() => editFileRef.current?.click()}
                >
                  Click to upload
                </div>
              )}
              <span className={styles.uploadHint}>Click image to replace</span>
              <input
                ref={editFileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleEditImageChange}
              />
            </div>
          </div>
        </div>

        <ModalFooter>
          <Button variant="outline" onClick={() => setEditTarget(null)}>
            Cancel
          </Button>
          <Button
            disabled={!editDraft.title.trim() || Boolean(updatingId)}
            onClick={handleUpdate}
          >
            {updatingId ? "Saving…" : "Save"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        isOpen={Boolean(deleteTargetId)}
        onClose={() => setDeleteTargetId(null)}
        title="Delete Category"
        size="sm"
      >
        <p
          style={{ fontSize: "var(--text-sm)", color: "var(--color-gray-700)" }}
        >
          Are you sure you want to delete this category? This cannot be undone.
        </p>
        <ModalFooter>
          <Button variant="outline" onClick={() => setDeleteTargetId(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={Boolean(deletingId)}
            onClick={handleDelete}
          >
            {deletingId ? "Deleting…" : "Delete"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};
