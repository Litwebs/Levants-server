import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  DataTableCard,
  PageContainer,
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
import {
  archiveDeal,
  createDeal,
  deactivateDeal,
  listDeals,
  updateDeal,
  type Deal,
  type DealDraft,
} from "@/context/Deals";
import { useDealCatalog as useVariantSearch } from "./useDealCatalog";
import { Checkbox } from "@/components/ui/checkbox";
import styles from "./DealsPage.module.css";
import { navigateWithDealTransition } from "./dealNavigation";

type SelectedItem = {
  variantId: string;
  variantName: string;
  productName: string;
  sku: string;
  price: number;
  quantity: number;
};

const emptyDraft = () => ({
  name: "",
  slug: "",
  description: "",
  image: "",
  packagePrice: "",
  isActive: true,
  isFeatured: false,
  startsAt: "",
  endsAt: "",
  sortOrder: "0",
});

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === "object" && "response" in error) {
    const response = (
      error as {
        response?: { data?: { message?: unknown } };
      }
    ).response;
    if (typeof response?.data?.message === "string") {
      return response.data.message;
    }
  }

  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

const toLocalInput = (value?: string | null) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

export const DealsPage = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission("promotions.create");
  const canUpdate = hasPermission("promotions.update");
  const canDelete = hasPermission("promotions.delete");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [loadError, setLoadError] = useState("");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Deal | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [imageChanged, setImageChanged] = useState(false);

  const {
    query,
    setQuery,
    results,
    loading: searching,
    error: searchError,
  } = useVariantSearch();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await listDeals({ page, pageSize });
      setMeta({
        total: res.meta?.total ?? res.deals.length,
        totalPages: res.meta?.totalPages ?? 1,
      });
      setDeals(res.deals);
    } catch (err: unknown) {
      setLoadError(getErrorMessage(err, "Failed to load deals"));
      showToast({
        type: "error",
        title: getErrorMessage(err, "Failed to load deals"),
      });
    } finally {
      setLoading(false);
    }
  }, [showToast, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const originalValue = useMemo(
    () =>
      selectedItems.reduce(
        (sum, item) => sum + item.price * Number(item.quantity || 0),
        0,
      ),
    [selectedItems],
  );

  const packagePrice = Number(draft.packagePrice || 0);
  const packageSaving = Math.max(0, originalValue - packagePrice);
  const savingPercent =
    originalValue > 0 ? Math.round((packageSaving / originalValue) * 100) : 0;

  const openCreate = () => {
    navigateWithDealTransition(navigate, "/deals/new", "forward");
  };

  const openEdit = (deal: Deal) => {
    setEditing(deal);
    setDraft({
      name: deal.name || "",
      slug: deal.slug || "",
      description: deal.description || "",
      image: deal.image?.url || deal.imageUrl || "",
      packagePrice: String(deal.packagePrice ?? ""),
      isActive: Boolean(deal.isActive),
      isFeatured: Boolean(deal.isFeatured),
      startsAt: toLocalInput(deal.startsAt),
      endsAt: toLocalInput(deal.endsAt),
      sortOrder: String(deal.sortOrder ?? 0),
    });
    setSelectedItems(
      (deal.items || []).map((item) => ({
        variantId: item.variantId,
        variantName: item.variant?.name || "Variant",
        productName: item.product?.name || "",
        sku: item.variant?.sku || "",
        price: Number(item.variant?.price || 0),
        quantity: Number(item.quantity || 1),
      })),
    );
    setImageChanged(false);
    setQuery("");
    setModalOpen(true);
  };

  const addVariant = (variantId: string) => {
    const variant = results.find((item) => item._id === variantId);
    if (!variant) return;
    if (selectedItems.some((item) => item.variantId === variantId)) return;

    setSelectedItems((prev) => [
      ...prev,
      {
        variantId,
        variantName: variant.name,
        productName: variant.product?.name || "",
        sku: variant.sku || "",
        price: Number(variant.price || 0),
        quantity: 1,
      },
    ]);
  };

  const setQuantity = (variantId: string, quantity: number) => {
    setSelectedItems((prev) =>
      prev.map((item) =>
        item.variantId === variantId
          ? {
              ...item,
              quantity: Math.min(999, Math.max(1, Math.floor(quantity || 1))),
            }
          : item,
      ),
    );
  };

  const removeVariant = (variantId: string) => {
    setSelectedItems((prev) =>
      prev.filter((item) => item.variantId !== variantId),
    );
  };

  const save = async () => {
    const name = draft.name.trim();
    if (!name) {
      showToast({ type: "error", title: "Deal name is required" });
      return;
    }
    if (selectedItems.length === 0) {
      showToast({ type: "error", title: "Add at least one product variant" });
      return;
    }
    if (!Number.isFinite(packagePrice) || packagePrice <= 0) {
      showToast({ type: "error", title: "Enter a valid package price" });
      return;
    }
    if (packagePrice >= originalValue) {
      showToast({
        type: "error",
        title: "Package price must be below the combined product value",
      });
      return;
    }
    if (
      draft.startsAt &&
      draft.endsAt &&
      new Date(draft.endsAt) <= new Date(draft.startsAt)
    ) {
      showToast({ type: "error", title: "End date must be after start date" });
      return;
    }

    const body: DealDraft = {
      name,
      ...(draft.slug.trim() ? { slug: draft.slug.trim().toLowerCase() } : {}),
      description: draft.description.trim(),
      ...(imageChanged ? { image: draft.image || null } : {}),
      items: selectedItems.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
      })),
      packagePrice,
      currency: "GBP",
      isActive: draft.isActive,
      isFeatured: draft.isFeatured,
      startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
      endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
      sortOrder: Math.min(
        9999,
        Math.max(0, Math.floor(Number(draft.sortOrder || 0))),
      ),
    };

    setSaving(true);
    try {
      if (editing) {
        await updateDeal(editing._id, body);
        showToast({ type: "success", title: "Deal updated" });
      } else {
        await createDeal(body);
        showToast({ type: "success", title: "Deal created" });
      }
      setModalOpen(false);
      await load();
    } catch (err: unknown) {
      showToast({
        type: "error",
        title: getErrorMessage(err, "Failed to save deal"),
      });
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (deal: Deal) => {
    setDeactivatingId(deal._id);
    try {
      await deactivateDeal(deal._id);
      showToast({ type: "success", title: "Deal deactivated" });
      await load();
    } catch (err: unknown) {
      showToast({
        type: "error",
        title: getErrorMessage(err, "Failed to deactivate deal"),
      });
    } finally {
      setDeactivatingId(null);
    }
  };

  const archive = async () => {
    if (!archiveTarget) return;
    setArchivingId(archiveTarget._id);
    try {
      await archiveDeal(archiveTarget._id);
      showToast({ type: "success", title: "Deal archived" });
      setArchiveTarget(null);
      await load();
    } catch (err: unknown) {
      showToast({
        type: "error",
        title: getErrorMessage(err, "Failed to archive deal"),
      });
    } finally {
      setArchivingId(null);
    }
  };

  const statusFor = (deal: Deal) => {
    if (deal.archivedAt)
      return { label: "Archived", variant: "default" as const };
    if (!deal.isActive)
      return { label: "Inactive", variant: "default" as const };
    const now = Date.now();
    if (deal.startsAt && new Date(deal.startsAt).getTime() > now) {
      return { label: "Scheduled", variant: "default" as const };
    }
    if (deal.endsAt && new Date(deal.endsAt).getTime() <= now) {
      return { label: "Expired", variant: "default" as const };
    }
    if (!deal.maxPackages)
      return { label: "Unavailable", variant: "warning" as const };
    if (deal.packagePrice >= Number(deal.originalValue || 0))
      return { label: "Review price", variant: "warning" as const };
    return {
      label: deal.isFeatured ? "Featured" : "Active",
      variant: "success" as const,
    };
  };

  return (
    <PageContainer className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Deals</h1>
          <div className={styles.subtitle}>
            Create product offers for your customers and feature them on the
            homepage.
          </div>
        </div>
        {canCreate && (
          <Button variant="primary" onClick={openCreate}>
            New Deal
          </Button>
        )}
      </div>

      {loadError && (
        <div role="alert">
          {loadError}{" "}
          <Button variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}
      <DataTableCard
        loading={loading}
        pagination={{
          page,
          pageSize,
          total: meta.total,
          totalPages: meta.totalPages,
          setPage,
          setPageSize,
          pageSizeOptions: [
            { value: "20", label: "20 per page" },
            { value: "50", label: "50 per page" },
          ],
          loading,
        }}
      >
        <div className={styles.tableWrap}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deal</TableHead>
                <TableHead>Products</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Deal price</TableHead>
                <TableHead>Saving</TableHead>
                <TableHead>Availability</TableHead>
                <TableHead>Status</TableHead>
                <TableHead align="right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8}>Loading deals…</TableCell>
                </TableRow>
              ) : deals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>No product packages yet.</TableCell>
                </TableRow>
              ) : (
                deals.map((deal) => (
                  <TableRow key={deal._id}>
                    <TableCell>
                      <div className={styles.dealIdentity}>
                        {deal.image?.url && (
                          <img
                            src={deal.image.url}
                            alt=""
                            className={styles.dealThumb}
                          />
                        )}
                        <div>
                          <strong>{deal.name}</strong>
                          <div className={styles.help}>/{deal.slug}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{deal.items?.length || 0}</TableCell>
                    <TableCell>
                      £{Number(deal.originalValue || 0).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <strong>
                        £{Number(deal.packagePrice || 0).toFixed(2)}
                      </strong>
                    </TableCell>
                    <TableCell>
                      £{Number(deal.savings || 0).toFixed(2)}
                      {deal.savingsPercent
                        ? " (" + deal.savingsPercent + "%)"
                        : ""}
                    </TableCell>
                    <TableCell>
                      {Number(deal.maxPackages || 0)} package
                      {Number(deal.maxPackages || 0) === 1 ? "" : "s"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusFor(deal).variant}>
                        {statusFor(deal).label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className={styles.actions}>
                        {canUpdate && !deal.archivedAt && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(deal)}
                          >
                            Edit
                          </Button>
                        )}
                        {canDelete && deal.isActive && !deal.archivedAt && (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={deactivatingId === deal._id}
                            onClick={() => void deactivate(deal)}
                          >
                            Deactivate
                          </Button>
                        )}
                        {canDelete && !deal.archivedAt && (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={archivingId === deal._id}
                            onClick={() => setArchiveTarget(deal)}
                          >
                            Archive
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DataTableCard>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit product package" : "Create product package"}
        size="lg"
      >
        <div className={styles.form}>
          <div className={styles.grid}>
            <Input
              label="Deal name *"
              value={draft.name}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Family Dairy Bundle"
            />
            <Input
              label="URL slug"
              value={draft.slug}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, slug: e.target.value }))
              }
              placeholder="family-dairy-bundle"
              hint="Leave blank to generate from the deal name."
            />

            <div className={styles.full}>
              <label className={styles.label}>Description</label>
              <textarea
                className={styles.textarea}
                value={draft.description}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="A weekly family selection at a better package price."
              />
            </div>

            <div className={styles.full}>
              <label className={styles.label}>Deal image</label>
              <input
                className={styles.nativeInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (
                    !["image/jpeg", "image/png", "image/webp"].includes(
                      file.type,
                    ) ||
                    file.size > 5 * 1024 * 1024
                  ) {
                    showToast({
                      type: "error",
                      title: "Choose a JPG, PNG or WEBP image up to 5 MB",
                    });
                    e.target.value = "";
                    return;
                  }
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    setDraft((prev) => ({
                      ...prev,
                      image: String(reader.result || ""),
                    }));
                    setImageChanged(true);
                  };
                  reader.readAsDataURL(file);
                }}
              />
              <div className={styles.help}>
                Optional. If no image is uploaded, the storefront uses the first
                product image in the package.
              </div>
              {draft.image && (
                <>
                  <img
                    className={styles.imagePreview}
                    src={draft.image}
                    alt="Deal preview"
                  />
                  <div className={styles.actions}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDraft((prev) => ({ ...prev, image: "" }));
                        setImageChanged(true);
                      }}
                    >
                      Remove image
                    </Button>
                  </div>
                </>
              )}
            </div>

            <Input
              label="Package price (£) *"
              type="number"
              min="0.01"
              step="0.01"
              value={draft.packagePrice}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  packagePrice: e.target.value,
                }))
              }
            />
            <Input
              label="Display order"
              type="number"
              min="0"
              step="1"
              value={draft.sortOrder}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, sortOrder: e.target.value }))
              }
            />
            <Input
              label="Starts at"
              type="datetime-local"
              value={draft.startsAt}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, startsAt: e.target.value }))
              }
            />
            <Input
              label="Ends at"
              type="datetime-local"
              value={draft.endsAt}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, endsAt: e.target.value }))
              }
            />

            <div className={styles.full + " " + styles.checks}>
              <label className={styles.check}>
                <Checkbox
                  aria-label="Active on storefront"
                  checked={draft.isActive}
                  onCheckedChange={(checked) =>
                    setDraft((prev) => ({
                      ...prev,
                      isActive: checked === true,
                    }))
                  }
                />
                Active on storefront
              </label>
              <label className={styles.check}>
                <Checkbox
                  aria-label="Featured deal"
                  checked={draft.isFeatured}
                  onCheckedChange={(checked) =>
                    setDraft((prev) => ({
                      ...prev,
                      isFeatured: checked === true,
                    }))
                  }
                />
                Featured deal
              </label>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Package products</div>
            <div className={styles.help}>
              Search existing variants and set how many of each belong in one
              package.
            </div>

            <Input
              label="Find product variant"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by product, variant or SKU"
            />
            {searching && <div className={styles.help}>Searching…</div>}
            {searchError && <div className={styles.error}>{searchError}</div>}

            {query.trim() && results.length > 0 && (
              <div className={styles.searchResults}>
                {results.map((variant) => {
                  const alreadyAdded = selectedItems.some(
                    (item) => item.variantId === variant._id,
                  );
                  return (
                    <div key={variant._id} className={styles.searchRow}>
                      <div>
                        <div className={styles.variantTitle}>
                          {variant.product?.name
                            ? variant.product.name + " — "
                            : ""}
                          {variant.name}
                        </div>
                        <div className={styles.variantMeta}>
                          {variant.sku} · £
                          {Number(variant.price || 0).toFixed(2)}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={alreadyAdded}
                        onClick={() => addVariant(variant._id)}
                      >
                        {alreadyAdded ? "Added" : "Add"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className={styles.selectedItems}>
              {selectedItems.map((item) => (
                <div key={item.variantId} className={styles.selectedRow}>
                  <div>
                    <div className={styles.variantTitle}>
                      {item.productName ? item.productName + " — " : ""}
                      {item.variantName}
                    </div>
                    <div className={styles.variantMeta}>
                      {item.sku} · £{item.price.toFixed(2)} each
                    </div>
                  </div>
                  <input
                    className={styles.nativeInput}
                    type="number"
                    min="1"
                    step="1"
                    value={item.quantity}
                    aria-label={"Quantity for " + item.variantName}
                    onChange={(e) =>
                      setQuantity(item.variantId, Number(e.target.value))
                    }
                  />
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => removeVariant(item.variantId)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>

            <div className={styles.summary}>
              <div className={styles.summaryBox}>
                <div className={styles.summaryLabel}>Combined value</div>
                <div className={styles.summaryValue}>
                  £{originalValue.toFixed(2)}
                </div>
              </div>
              <div className={styles.summaryBox}>
                <div className={styles.summaryLabel}>Package price</div>
                <div className={styles.summaryValue}>
                  £{packagePrice.toFixed(2)}
                </div>
              </div>
              <div className={styles.summaryBox}>
                <div className={styles.summaryLabel}>Customer saving</div>
                <div
                  className={
                    styles.summaryValue +
                    (packageSaving > 0 ? " " + styles.positive : "")
                  }
                >
                  £{packageSaving.toFixed(2)}
                  {savingPercent > 0 ? " · " + savingPercent + "%" : ""}
                </div>
              </div>
            </div>
          </div>
        </div>

        <ModalFooter>
          <Button variant="outline" onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Create deal"}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        title="Archive product package"
        size="sm"
      >
        <p>
          Archive <strong>{archiveTarget?.name}</strong>? It will be removed
          from the storefront and can no longer be edited or reactivated.
          Existing orders keep their package snapshot.
        </p>
        <ModalFooter>
          <Button variant="outline" onClick={() => setArchiveTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={Boolean(archivingId)}
            onClick={() => void archive()}
          >
            {archivingId ? "Archiving…" : "Archive deal"}
          </Button>
        </ModalFooter>
      </Modal>
    </PageContainer>
  );
};
