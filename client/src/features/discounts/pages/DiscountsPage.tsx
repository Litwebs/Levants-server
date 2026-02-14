import { useMemo, useState } from "react";

import {
  Card,
  CardFooter,
  Button,
  Badge,
  Modal,
  ModalFooter,
  Input,
  Select,
  FormGrid,
  FormRow,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/common";
import { useToast } from "@/components/common/Toast";
import { usePermissions } from "@/hooks/usePermissions";

import { getDiscountDetails } from "../api/discountsAdminApi";
import { useDiscountsAdmin } from "../hooks/useDiscountsAdmin";
import { useVariantSearch } from "../hooks/useVariantSearch";
import type {
  CreateDiscountBody,
  DiscountDetails,
  DiscountKind,
  DiscountScope,
} from "../types";

import styles from "./DiscountsPage.module.css";

const formatDateTime = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
};

const emptyDraft: CreateDiscountBody = {
  name: "",
  code: "",
  kind: "percent",
  percentOff: 10,
  scope: "global",
  currency: "GBP",
  startsAt: "",
  endsAt: "",
  maxRedemptions: undefined,
  perCustomerLimit: undefined,
  category: "",
  variantIds: [],
};

export const DiscountsPage = () => {
  const { showToast } = useToast();
  const { hasPermission } = usePermissions();

  type SelectedVariant = { _id: string; name: string };

  const canCreate = hasPermission("promotions.create");
  const canDelete = hasPermission("promotions.delete");

  const {
    discounts,
    loading,
    error,
    creating,
    deletingId,
    meta,
    page,
    pageSize,
    totalPages,
    setPage,
    setPageSize,
    create,
    deactivate,
  } = useDiscountsAdmin({ page: 1, pageSize: 20 });

  const total = meta?.total ?? 0;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<CreateDiscountBody>(emptyDraft);
  const [selectedVariants, setSelectedVariants] = useState<SelectedVariant[]>(
    [],
  );

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsDiscountId, setDetailsDiscountId] = useState<string | null>(
    null,
  );
  const [details, setDetails] = useState<DiscountDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsPage, setDetailsPage] = useState(1);
  const [detailsTotalPages, setDetailsTotalPages] = useState(1);

  const {
    query: variantQuery,
    setQuery: setVariantQuery,
    results: variantResults,
    loading: variantSearching,
    error: variantSearchError,
    hasQuery: hasVariantQuery,
  } = useVariantSearch();

  const kind = draft.kind as DiscountKind;
  const scope = draft.scope as DiscountScope;

  const normalizedDraft = useMemo<CreateDiscountBody>(() => {
    const body: CreateDiscountBody = {
      name: String(draft.name || "").trim(),
      kind: kind,
      scope: scope,
    };

    const code = String(draft.code || "").trim();
    if (code) body.code = code.toUpperCase();

    if (kind === "percent") {
      body.percentOff = Number(draft.percentOff);
    } else {
      body.amountOff = Number(draft.amountOff);
      body.currency = String(draft.currency || "GBP")
        .trim()
        .toUpperCase();
    }

    if (draft.startsAt) body.startsAt = draft.startsAt;
    if (draft.endsAt) body.endsAt = draft.endsAt;

    if (typeof draft.maxRedemptions === "number" && draft.maxRedemptions > 0) {
      body.maxRedemptions = draft.maxRedemptions;
    }
    if (
      typeof draft.perCustomerLimit === "number" &&
      draft.perCustomerLimit > 0
    ) {
      body.perCustomerLimit = draft.perCustomerLimit;
    }

    if (scope === "category") {
      body.category = String(draft.category || "").trim();
    }

    if (scope === "variant") {
      body.variantIds = selectedVariants.map((v) => v._id);
    }

    return body;
  }, [draft, kind, scope, selectedVariants]);

  const openCreate = () => {
    setDraft(emptyDraft);
    setVariantQuery("");
    setSelectedVariants([]);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
  };

  const fetchDetails = async (discountId: string, pageNumber: number) => {
    setDetailsLoading(true);
    try {
      const res = await getDiscountDetails(discountId, {
        page: pageNumber,
        pageSize: 20,
      });
      setDetails(res.details);
      setDetailsTotalPages(res.meta?.totalPages ?? 1);
    } catch (err: any) {
      showToast({
        type: "error",
        title:
          err?.response?.data?.message ||
          err?.message ||
          "Failed to load discount details",
      });
      setDetails(null);
      setDetailsTotalPages(1);
    } finally {
      setDetailsLoading(false);
    }
  };

  const openDetails = (discountId: string) => {
    setDetailsDiscountId(discountId);
    setDetailsPage(1);
    setDetails(null);
    setDetailsOpen(true);
    void fetchDetails(discountId, 1);
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    setDetailsDiscountId(null);
    setDetails(null);
    setDetailsPage(1);
    setDetailsTotalPages(1);
  };

  const onSave = async () => {
    try {
      if (!normalizedDraft.name) {
        showToast({ type: "error", title: "Name is required" });
        return;
      }

      if (kind === "percent") {
        const p = Number(normalizedDraft.percentOff);
        if (!Number.isFinite(p) || p < 1 || p > 100) {
          showToast({ type: "error", title: "Percent must be 1-100" });
          return;
        }
      }

      if (kind === "amount") {
        const a = Number(normalizedDraft.amountOff);
        if (!Number.isFinite(a) || a <= 0) {
          showToast({ type: "error", title: "Amount must be > 0" });
          return;
        }
      }

      if (
        scope === "category" &&
        !String(normalizedDraft.category || "").trim()
      ) {
        showToast({ type: "error", title: "Category is required" });
        return;
      }

      if (
        scope === "variant" &&
        (!normalizedDraft.variantIds || normalizedDraft.variantIds.length === 0)
      ) {
        showToast({ type: "error", title: "Select at least one variant" });
        return;
      }

      await create(normalizedDraft);
      showToast({ type: "success", title: "Discount created" });
      closeCreate();
    } catch (err: any) {
      showToast({
        type: "error",
        title:
          err?.response?.data?.message ||
          err?.message ||
          "Failed to create discount",
      });
    }
  };

  const onDeactivate = async (id: string) => {
    try {
      await deactivate(id);
      showToast({ type: "success", title: "Discount deactivated" });
    } catch (err: any) {
      showToast({
        type: "error",
        title:
          err?.response?.data?.message ||
          err?.message ||
          "Failed to deactivate discount",
      });
    }
  };

  const selectedVariantIds = useMemo(
    () => selectedVariants.map((v) => v._id),
    [selectedVariants],
  );

  const addVariant = (variantId: string) => {
    const match = variantResults.find((v) => v._id === variantId);
    if (!match) return;

    setSelectedVariants((prev) => {
      if (prev.some((v) => v._id === variantId)) return prev;
      return [...prev, { _id: match._id, name: match.name }];
    });

    setDraft((p) => {
      const prevIds = Array.isArray(p.variantIds) ? p.variantIds : [];
      if (prevIds.includes(variantId)) return p;
      return { ...p, variantIds: [...prevIds, variantId] };
    });
  };

  const removeVariant = (variantId: string) => {
    setSelectedVariants((prev) => prev.filter((v) => v._id !== variantId));
    setDraft((p) => {
      const prevIds = Array.isArray(p.variantIds) ? p.variantIds : [];
      return { ...p, variantIds: prevIds.filter((id) => id !== variantId) };
    });
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Discounts</div>
          <div className={styles.subtitle}>
            Stripe-backed discount codes (scoped + limited)
          </div>
        </div>

        {canCreate && (
          <Button variant="primary" onClick={openCreate}>
            New Discount
          </Button>
        )}
      </div>

      <Card>
        {error && <div className={styles.muted}>{error}</div>}
        <div className={styles.tableWrapper}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Starts</TableHead>
                <TableHead>Ends</TableHead>
                <TableHead>Limits</TableHead>
                <TableHead align="right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9}>
                    <span className={styles.muted}>Loading…</span>
                  </TableCell>
                </TableRow>
              ) : discounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9}>
                    <span className={styles.muted}>No discounts yet</span>
                  </TableCell>
                </TableRow>
              ) : (
                discounts.map((d) => {
                  const kindLabel =
                    d.kind === "percent"
                      ? `${d.percentOff ?? "—"}%`
                      : `${d.amountOff ?? "—"} ${(d.currency || "").toUpperCase()}`;

                  const limits =
                    `${d.maxRedemptions ? `Max: ${d.maxRedemptions}` : ""}` +
                    `${d.maxRedemptions && d.perCustomerLimit ? " • " : ""}` +
                    `${d.perCustomerLimit ? `Per customer: ${d.perCustomerLimit}` : ""}`;

                  return (
                    <TableRow key={d._id} onClick={() => openDetails(d._id)}>
                      <TableCell>
                        <button
                          type="button"
                          className={styles.codeLink}
                          onClick={() => openDetails(d._id)}
                        >
                          {d.code}
                        </button>
                      </TableCell>
                      <TableCell>{d.name}</TableCell>
                      <TableCell>{kindLabel}</TableCell>
                      <TableCell>
                        {d.scope}
                        {d.scope === "category" && d.category ? (
                          <div className={styles.formHelp}>{d.category}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {d.isActive ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="default">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatDateTime(d.startsAt)}</TableCell>
                      <TableCell>{formatDateTime(d.endsAt)}</TableCell>
                      <TableCell>
                        {limits ? (
                          <span>{limits}</span>
                        ) : (
                          <span className={styles.muted}>—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className={styles.actions}>
                          {canDelete && d.isActive ? (
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={deletingId === d._id}
                              onClick={() => onDeactivate(d._id)}
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <CardFooter className={styles.paginationFooter}>
          <div className={styles.paginationInfo}>
            {meta ? (
              <>
                Showing {rangeStart}–{rangeEnd} of {total}
              </>
            ) : (
              <>
                Page {page} / {totalPages}
              </>
            )}
          </div>

          <div className={styles.paginationControls}>
            <Select
              className={styles.pageSizeSelect}
              value={String(pageSize)}
              disabled={loading}
              onChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
              options={[
                { value: "10", label: "10 / page" },
                { value: "20", label: "20 / page" },
                { value: "50", label: "50 / page" },
              ]}
            />

            <div className={styles.pageButtons}>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Prev
              </Button>

              <div className={styles.pageLabel}>
                Page {page} / {totalPages}
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={loading || page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardFooter>
      </Card>

      <Modal
        isOpen={detailsOpen}
        onClose={closeDetails}
        title={
          details?.discount?.code
            ? `Discount: ${details.discount.code}`
            : "Discount details"
        }
      >
        {detailsLoading ? (
          <div className={styles.muted}>Loading…</div>
        ) : !details ? (
          <div className={styles.muted}>No details</div>
        ) : (
          <>
            <div className={styles.detailsSummary}>
              <div>
                <strong>Claims:</strong> {details.claims.total}
              </div>
              <div>
                <strong>Unique customers:</strong>{" "}
                {details.claims.uniqueCustomers}
              </div>
              <div>
                <strong>Scope:</strong> {details.discount.scope}
              </div>
            </div>

            {details.discount.scope === "variant" ? (
              <div className={styles.detailsTargets}>
                <div>
                  <strong>Variants:</strong>{" "}
                  {details.variants && details.variants.length > 0 ? (
                    <div className={styles.selectedList}>
                      {details.variants.map((v) => (
                        <span key={v._id} className={styles.selectedChip}>
                          {v.name}
                          {v.sku ? (
                            <span className={styles.muted}>({v.sku})</span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className={styles.muted}>—</span>
                  )}
                </div>
              </div>
            ) : null}

            <div className={styles.tableWrapper}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead align="right">Total</TableHead>
                    <TableHead>Redeemed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {details.redemptions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <span className={styles.muted}>No claims yet</span>
                      </TableCell>
                    </TableRow>
                  ) : (
                    details.redemptions.map((r) => (
                      <TableRow key={r._id}>
                        <TableCell>{r.order?.orderId || "—"}</TableCell>
                        <TableCell>
                          {r.customer?.email || r.customer?.name || "—"}
                        </TableCell>
                        <TableCell>{r.order?.status || "—"}</TableCell>
                        <TableCell align="right">
                          {typeof r.order?.total === "number"
                            ? r.order.total.toFixed(2)
                            : "—"}
                        </TableCell>
                        <TableCell>{formatDateTime(r.redeemedAt)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <CardFooter className={styles.paginationFooter}>
              <div className={styles.paginationInfo}>
                Page {detailsPage} / {detailsTotalPages}
              </div>

              <div className={styles.paginationControls}>
                <div className={styles.pageButtons}>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      detailsLoading || detailsPage <= 1 || !detailsDiscountId
                    }
                    onClick={() => {
                      if (!detailsDiscountId) return;
                      const next = Math.max(1, detailsPage - 1);
                      setDetailsPage(next);
                      void fetchDetails(detailsDiscountId, next);
                    }}
                  >
                    Prev
                  </Button>

                  <div className={styles.pageLabel}>
                    Page {detailsPage} / {detailsTotalPages}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      detailsLoading ||
                      detailsPage >= detailsTotalPages ||
                      !detailsDiscountId
                    }
                    onClick={() => {
                      if (!detailsDiscountId) return;
                      const next = Math.min(detailsTotalPages, detailsPage + 1);
                      setDetailsPage(next);
                      void fetchDetails(detailsDiscountId, next);
                    }}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardFooter>
          </>
        )}
      </Modal>

      <Modal isOpen={createOpen} onClose={closeCreate} title="Create Discount">
        <FormGrid>
          <FormRow label="Name">
            <Input
              value={draft.name}
              onChange={(e) =>
                setDraft((p) => ({ ...p, name: e.target.value }))
              }
              placeholder="e.g. Winter Sale"
            />
          </FormRow>

          <FormRow label="Code (optional)">
            <Input
              value={draft.code || ""}
              onChange={(e) =>
                setDraft((p) => ({ ...p, code: e.target.value.toUpperCase() }))
              }
              placeholder="e.g. WINTER10"
            />
            <div className={styles.formHelp}>
              Leave empty to auto-generate a code.
            </div>
          </FormRow>

          <FormRow label="Kind">
            <Select
              value={draft.kind}
              options={[
                { value: "percent", label: "Percent" },
                { value: "amount", label: "Fixed amount" },
              ]}
              onChange={(value) =>
                setDraft((p) => ({
                  ...p,
                  kind: value as DiscountKind,
                }))
              }
            />
          </FormRow>

          {kind === "percent" ? (
            <FormRow label="Percent off">
              <Input
                type="number"
                min={1}
                max={100}
                value={draft.percentOff ?? 10}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    percentOff: Number(e.target.value),
                  }))
                }
              />
            </FormRow>
          ) : (
            <>
              <FormRow label="Amount off">
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={draft.amountOff ?? 1}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      amountOff: Number(e.target.value),
                    }))
                  }
                />
              </FormRow>
              <FormRow label="Currency">
                <Input
                  value={draft.currency ?? "GBP"}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      currency: e.target.value.toUpperCase(),
                    }))
                  }
                />
              </FormRow>
            </>
          )}

          <FormRow label="Scope">
            <Select
              value={draft.scope}
              options={[
                { value: "global", label: "Global" },
                { value: "category", label: "Category" },
                { value: "variant", label: "Variants" },
              ]}
              onChange={(value) => {
                setSelectedVariants([]);
                setDraft((p) => ({
                  ...p,
                  scope: value as DiscountScope,
                  category: "",
                  variantIds: [],
                }));
              }}
            />
          </FormRow>

          {scope === "category" ? (
            <FormRow label="Category">
              <Input
                value={draft.category ?? ""}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, category: e.target.value }))
                }
                placeholder="e.g. Milk"
              />
            </FormRow>
          ) : null}

          {scope === "variant" ? (
            <FormRow label="Variants">
              <div className={styles.autocomplete}>
                <Input
                  value={variantQuery}
                  onChange={(e) => setVariantQuery(e.target.value)}
                  placeholder="Search variants by name, SKU, or product…"
                />

                {hasVariantQuery && (
                  <div className={styles.suggestions}>
                    {variantSearching ? (
                      <div className={styles.suggestionItem}>
                        <div className={styles.suggestionMain}>Searching…</div>
                      </div>
                    ) : variantSearchError ? (
                      <div className={styles.suggestionItem}>
                        <div className={styles.suggestionMain}>
                          Search failed
                        </div>
                        <div className={styles.suggestionSub}>
                          {variantSearchError}
                        </div>
                      </div>
                    ) : variantResults.length === 0 ? (
                      <div className={styles.suggestionItem}>
                        <div className={styles.suggestionMain}>No results</div>
                      </div>
                    ) : (
                      variantResults.map((v) => (
                        <div
                          key={v._id}
                          className={styles.suggestionItem}
                          onClick={() => addVariant(v._id)}
                        >
                          <div className={styles.suggestionMain}>{v.name}</div>
                          <div className={styles.suggestionSub}>
                            {v.sku}
                            {v.product?.name ? ` • ${v.product.name}` : ""}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {selectedVariants.length > 0 ? (
                  <div className={styles.selectedList}>
                    {selectedVariants.map((v) => (
                      <span key={v._id} className={styles.selectedChip}>
                        {v.name}
                        <button
                          type="button"
                          className={styles.chipRemove}
                          onClick={() => removeVariant(v._id)}
                          aria-label="Remove variant"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className={styles.formHelp}>
                    Select one or more variants.
                  </div>
                )}
              </div>
            </FormRow>
          ) : null}

          <FormRow label="Starts at (optional)">
            <Input
              type="datetime-local"
              value={draft.startsAt || ""}
              onChange={(e) =>
                setDraft((p) => ({ ...p, startsAt: e.target.value }))
              }
            />
          </FormRow>

          <FormRow label="Ends at (optional)">
            <Input
              type="datetime-local"
              value={draft.endsAt || ""}
              onChange={(e) =>
                setDraft((p) => ({ ...p, endsAt: e.target.value }))
              }
            />
            <div className={styles.formHelp}>
              Used for Stripe expiration / redeem-by.
            </div>
          </FormRow>

          <FormRow label="Max redemptions (optional)">
            <Input
              type="number"
              min={1}
              value={draft.maxRedemptions ?? ""}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  maxRedemptions: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                }))
              }
            />
          </FormRow>

          <FormRow label="Per-customer limit (optional)">
            <Input
              type="number"
              min={1}
              value={draft.perCustomerLimit ?? ""}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  perCustomerLimit: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                }))
              }
            />
          </FormRow>
        </FormGrid>

        <ModalFooter>
          <Button variant="secondary" onClick={closeCreate}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSave} disabled={creating}>
            {creating ? "Creating…" : "Create"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};
