import { Button, Modal, ModalFooter } from "../../components/common";
import { getStatusBadge, getPaymentBadge } from "./order.utils";
import styles from "./Orders.module.css";
import { useEffect, useMemo, useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useVariantSearch } from "../Discounts/useVariantSearch";

const OrderDetailModal = ({
  selectedOrder,
  isDetailModalOpen,
  setIsDetailModalOpen,
  setIsStatusModalOpen,
  updateOrderPaymentStatus,
  updateOrderItems,
  refundOrder,
}: any) => {
  const { hasPermission } = usePermissions();
  const canRefundPermission = hasPermission("orders.refund");
  const canUpdatePermission = hasPermission("orders.update");
  const canUpdatePaymentPermission =
    canUpdatePermission || hasPermission("orders.payment.update");

  const [isRefundConfirmOpen, setIsRefundConfirmOpen] = useState(false);
  const [isRefunding, setIsRefunding] = useState(false);
  const [refundAmount, setRefundAmount] = useState<string>("");
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);
  const [isPaymentConfirmOpen, setIsPaymentConfirmOpen] = useState(false);
  const [nextPaidValue, setNextPaidValue] = useState<boolean | null>(null);
  const [paymentMode, setPaymentMode] = useState<"full" | "custom">("full");
  const [customPayAmount, setCustomPayAmount] = useState<string>("");

  const [isEditingItems, setIsEditingItems] = useState(false);
  const [isSavingItems, setIsSavingItems] = useState(false);
  const [includeDeliveryFeeInTotal, setIncludeDeliveryFeeInTotal] =
    useState(true);
  const [draftItems, setDraftItems] = useState<
    {
      variantId: string;
      name: string;
      sku?: string;
      unitPrice: number;
      quantity: number;
    }[]
  >([]);

  const variantSearch = useVariantSearch();

  const isAlreadyRefunded = selectedOrder?.paymentStatus === "refunded";
  const isRefundPending = selectedOrder?.paymentStatus === "refund_pending";
  const isPartiallyRefunded =
    selectedOrder?.paymentStatus === "partially_refunded";
  const isRefundRelated =
    isAlreadyRefunded || isRefundPending || isPartiallyRefunded;

  const isPartiallyPaid = selectedOrder?.paymentStatus === "partially_paid";
  const isPaid = selectedOrder?.paymentStatus === "paid" || isPartiallyPaid;
  const canTogglePaymentStatus =
    canUpdatePaymentPermission &&
    Boolean(selectedOrder?.id) &&
    Boolean(selectedOrder?.isManualImport) &&
    !selectedOrder?.isStripeBacked &&
    !isRefundRelated;
  const canRefund =
    canRefundPermission &&
    Boolean(selectedOrder?.id) &&
    !selectedOrder?.isManualImport &&
    !isAlreadyRefunded &&
    !isRefundPending;

  const itemEditBlockedReason = useMemo(() => {
    if (!canUpdatePermission)
      return "You do not have permission to edit orders";
    if (!selectedOrder?.id) return "Order is not loaded";
    if (!selectedOrder?.isManualImport)
      return "Only imported orders can be edited";
    return "";
  }, [canUpdatePermission, selectedOrder?.id, selectedOrder?.isManualImport]);

  const canEditItems = canUpdatePermission && !itemEditBlockedReason;

  const hasVariantIds = useMemo(() => {
    const items = Array.isArray(selectedOrder?.items)
      ? selectedOrder.items
      : [];
    return items.every(
      (i: any) => typeof i?.variantId === "string" && i.variantId.trim(),
    );
  }, [selectedOrder?.items]);

  useEffect(() => {
    if (!isDetailModalOpen) {
      setIsEditingItems(false);
      setIsSavingItems(false);
      setIncludeDeliveryFeeInTotal(true);
      setDraftItems([]);
      variantSearch.setQuery("");
      return;
    }

    // If modal is open but the order changes, reset edit state.
    setIsEditingItems(false);
    setIsSavingItems(false);
    setIncludeDeliveryFeeInTotal(
      Boolean(selectedOrder?.includeDeliveryFeeInTotal ?? true),
    );
    setDraftItems([]);
    variantSearch.setQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isDetailModalOpen,
    selectedOrder?.id,
    selectedOrder?.includeDeliveryFeeInTotal,
  ]);

  const draftSubtotal = useMemo(() => {
    return draftItems.reduce(
      (sum, it) =>
        sum + (Number(it.unitPrice) || 0) * (Number(it.quantity) || 0),
      0,
    );
  }, [draftItems]);

  const draftImportedBaseTotal = useMemo(() => {
    if (!selectedOrder?.isManualImport) return draftSubtotal;
    if (selectedOrder.usesImportedBasePricing) {
      const importedAdjustment =
        Number(selectedOrder.importedBaseTotal || 0) -
        Number(selectedOrder.subtotal || 0);
      return Math.max(0, draftSubtotal + importedAdjustment);
    }
    return draftSubtotal;
  }, [
    draftSubtotal,
    selectedOrder?.importedBaseTotal,
    selectedOrder?.isManualImport,
    selectedOrder?.subtotal,
    selectedOrder?.usesImportedBasePricing,
  ]);

  const draftTotal = useMemo(() => {
    const deliveryFee = includeDeliveryFeeInTotal
      ? Number(selectedOrder?.deliveryFee || 0)
      : 0;
    const discount = Number(selectedOrder?.discount || 0);
    const totalBase = selectedOrder?.isManualImport
      ? draftImportedBaseTotal
      : draftSubtotal;
    return Math.max(0, totalBase + deliveryFee - Math.max(0, discount));
  }, [
    draftImportedBaseTotal,
    draftSubtotal,
    includeDeliveryFeeInTotal,
    selectedOrder?.deliveryFee,
    selectedOrder?.discount,
    selectedOrder?.isManualImport,
  ]);

  const proofUrl =
    typeof selectedOrder?.deliveryProofUrl === "string"
      ? selectedOrder.deliveryProofUrl
      : undefined;

  const deliveryNote =
    typeof selectedOrder?.deliveryNote === "string"
      ? selectedOrder.deliveryNote.trim()
      : "";

  const customerInstructions =
    typeof selectedOrder?.customerInstructions === "string"
      ? selectedOrder.customerInstructions.trim()
      : "";

  const deliveredAtIso =
    typeof selectedOrder?.deliveredAt === "string"
      ? selectedOrder.deliveredAt
      : selectedOrder?.deliveryStatus === "delivered"
        ? selectedOrder?.updatedAt
        : null;

  const deliveredAtLabel = deliveredAtIso
    ? new Date(deliveredAtIso).toLocaleString("en-GB")
    : "—";

  return (
    <>
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={`Order ${selectedOrder?.orderNumber || ""}`}
        size="lg"
      >
        {selectedOrder ? (
          <div className={styles.orderDetail}>
            <div className={styles.detailHeader}>
              <div className={styles.detailStatus}>
                {getStatusBadge(
                  selectedOrder.deliveryStatus?.replace(/_/g, " "),
                )}
                {getPaymentBadge(selectedOrder.paymentStatus)}
              </div>
              <span className={styles.detailDate}>
                Created:{" "}
                {new Date(selectedOrder.createdAt).toLocaleString("en-GB")}
              </span>
            </div>

            <div className={styles.detailGrid}>
              <div className={styles.detailSection}>
                <h4 className={styles.detailTitle}>Customer</h4>
                <p>{selectedOrder.customer.name}</p>
                <p>{selectedOrder.customer.email}</p>
                <p>{selectedOrder.customer.phone}</p>
              </div>

              <div className={styles.detailSection}>
                <h4 className={styles.detailTitle}>Delivery Address</h4>
                <p>{selectedOrder.deliveryAddress.line1}</p>
                {selectedOrder.deliveryAddress.line2 && (
                  <p>{selectedOrder.deliveryAddress.line2}</p>
                )}
                <p>
                  {selectedOrder.deliveryAddress.city},{" "}
                  {selectedOrder.deliveryAddress.postcode}
                </p>
              </div>

              <div className={styles.detailSection}>
                <h4 className={styles.detailTitle}>Delivery Slot</h4>
                <p>
                  {new Date(selectedOrder.deliverySlot.date).toLocaleDateString(
                    "en-GB",
                    {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    },
                  )}
                </p>
                <p>{selectedOrder.deliverySlot.timeWindow}</p>
              </div>
            </div>

            <div className={styles.itemsSection}>
              <div className={styles.itemsHeaderRow}>
                <h4 className={styles.detailTitle}>Order Items</h4>
              </div>
              <table className={styles.itemsTable}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Variant</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Total</th>
                    {isEditingItems ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {(isEditingItems ? draftItems : selectedOrder.items).map(
                    (item: any, index: number) => (
                      <tr key={item?.variantId || index}>
                        <td>{item.name}</td>
                        <td>{item.variant || item.sku || "-"}</td>
                        <td>
                          {isEditingItems ? (
                            <input
                              className={styles.itemQtyInput}
                              type="number"
                              inputMode="numeric"
                              min={1}
                              value={String(item.quantity ?? "")}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const qty = Math.max(
                                  1,
                                  Math.floor(Number(raw || 1)),
                                );
                                setDraftItems((prev) =>
                                  prev.map((it, idx) =>
                                    idx === index
                                      ? { ...it, quantity: qty }
                                      : it,
                                  ),
                                );
                              }}
                            />
                          ) : (
                            item.quantity
                          )}
                        </td>
                        <td>£{Number(item.unitPrice || 0).toFixed(2)}</td>
                        <td>
                          £
                          {(
                            (Number(item.quantity) || 0) *
                            (Number(item.unitPrice) || 0)
                          ).toFixed(2)}
                        </td>
                        {isEditingItems ? (
                          <td className={styles.itemActionsCell}>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={draftItems.length <= 1}
                              onClick={() => {
                                setDraftItems((prev) =>
                                  prev.filter((_, idx) => idx !== index),
                                );
                              }}
                            >
                              Remove
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    ),
                  )}
                </tbody>
              </table>

              {isEditingItems ? (
                <div className={styles.itemEditPanel}>
                  <div className={styles.filterGroup}>
                    <label
                      className={styles.filterLabel}
                      htmlFor="variantSearch"
                    >
                      Add item (search by name / SKU)
                    </label>
                    <input
                      id="variantSearch"
                      className={styles.filterInput}
                      value={variantSearch.query}
                      onChange={(e) => variantSearch.setQuery(e.target.value)}
                      placeholder="Search variants…"
                      disabled={isSavingItems}
                    />
                  </div>

                  {variantSearch.hasQuery ? (
                    <div className={styles.variantResults}>
                      {variantSearch.loading ? (
                        <div className={styles.variantResultEmpty}>
                          Searching…
                        </div>
                      ) : variantSearch.error ? (
                        <div className={styles.variantResultEmpty}>
                          {variantSearch.error}
                        </div>
                      ) : variantSearch.results.length ? (
                        variantSearch.results.map((v) => (
                          <div key={v._id} className={styles.variantResultRow}>
                            <div className={styles.variantResultText}>
                              <div className={styles.variantResultName}>
                                {v.product?.name ? `${v.product.name} • ` : ""}
                                {v.name}
                              </div>
                              <div className={styles.variantResultMeta}>
                                {v.sku}
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={
                                String(v.status || "active") !== "active"
                              }
                              onClick={() => {
                                setDraftItems((prev) => {
                                  const idx = prev.findIndex(
                                    (x) =>
                                      String(x.variantId) === String(v._id),
                                  );

                                  if (idx >= 0) {
                                    const next = [...prev];
                                    next[idx] = {
                                      ...next[idx],
                                      quantity: Math.max(
                                        1,
                                        (next[idx].quantity || 0) + 1,
                                      ),
                                    };
                                    return next;
                                  }

                                  return [
                                    ...prev,
                                    {
                                      variantId: v._id,
                                      name: v.name,
                                      sku: v.sku,
                                      unitPrice: Number(v.price || 0),
                                      quantity: 1,
                                    },
                                  ];
                                });
                                variantSearch.setQuery("");
                              }}
                            >
                              Add
                            </Button>
                          </div>
                        ))
                      ) : (
                        <div className={styles.variantResultEmpty}>
                          No results
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {canUpdatePermission ? (
                <div className={styles.itemsFooterActions}>
                  {!canEditItems || !hasVariantIds ? (
                    <span className={styles.itemsEditHint}>
                      {itemEditBlockedReason || "Missing item variant IDs"}
                    </span>
                  ) : !isEditingItems ? (
                    <span className={styles.itemsEditHint}>
                      {selectedOrder?.isManualImport
                        ? "Change quantities, remove lines, or add new items."
                        : "Only imported orders can be edited."}
                    </span>
                  ) : null}

                  <div className={styles.itemsActionButtons}>
                    <Button
                      variant={isEditingItems ? "ghost" : "outline"}
                      size="sm"
                      disabled={!canEditItems || !hasVariantIds}
                      onClick={() => {
                        if (!canEditItems || !hasVariantIds) return;

                        if (isEditingItems) {
                          setIsEditingItems(false);
                          setDraftItems([]);
                          variantSearch.setQuery("");
                          return;
                        }

                        const items = Array.isArray(selectedOrder?.items)
                          ? selectedOrder.items
                          : [];

                        setDraftItems(
                          items
                            .filter(
                              (i: any) => typeof i?.variantId === "string",
                            )
                            .map((i: any) => ({
                              variantId: String(i.variantId),
                              name: String(i.name || ""),
                              sku:
                                typeof i.variant === "string"
                                  ? i.variant
                                  : undefined,
                              unitPrice: Number(i.unitPrice || 0),
                              quantity: Number(i.quantity || 1),
                            })),
                        );
                        setIncludeDeliveryFeeInTotal(
                          Boolean(
                            selectedOrder?.includeDeliveryFeeInTotal ?? true,
                          ),
                        );
                        setIsEditingItems(true);
                      }}
                    >
                      {isEditingItems ? "Cancel edit" : "Edit items"}
                    </Button>

                    {isEditingItems ? (
                      <Button
                        variant="primary"
                        size="sm"
                        isLoading={isSavingItems}
                        disabled={isSavingItems || draftItems.length === 0}
                        onClick={async () => {
                          if (!selectedOrder?.id) return;
                          if (!draftItems.length) return;
                          setIsSavingItems(true);
                          try {
                            const payload = draftItems.map((i) => ({
                              variantId: String(i.variantId),
                              quantity: Number(i.quantity) || 1,
                            }));

                            const updated = await updateOrderItems?.(
                              selectedOrder.id,
                              payload,
                              selectedOrder.isManualImport
                                ? {
                                    importedBaseTotal: draftImportedBaseTotal,
                                    includeDeliveryFee:
                                      includeDeliveryFeeInTotal,
                                  }
                                : undefined,
                            );
                            if (updated) {
                              setIsEditingItems(false);
                              setDraftItems([]);
                              variantSearch.setQuery("");
                            }
                          } finally {
                            setIsSavingItems(false);
                          }
                        }}
                      >
                        Save items
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className={styles.totalsSection}>
              <div className={styles.totalRow}>
                <span>Subtotal</span>
                <span>
                  £
                  {(isEditingItems
                    ? draftSubtotal
                    : selectedOrder.subtotal
                  ).toFixed(2)}
                </span>
              </div>
              <div className={styles.totalRow}>
                <span>Delivery Fee</span>
                <span>
                  £{selectedOrder.deliveryFee.toFixed(2)}
                  {isEditingItems && selectedOrder.isManualImport
                    ? includeDeliveryFeeInTotal
                      ? " included"
                      : " excluded"
                    : ""}
                </span>
              </div>
              {isEditingItems && selectedOrder.isManualImport ? (
                <label className={styles.checkboxFilter}>
                  <input
                    type="checkbox"
                    checked={includeDeliveryFeeInTotal}
                    onChange={(e) =>
                      setIncludeDeliveryFeeInTotal(e.target.checked)
                    }
                    disabled={isSavingItems}
                  />
                  Include delivery fee in imported total
                </label>
              ) : null}
              {selectedOrder.discount > 0 && (
                <div className={styles.totalRow}>
                  <span>Discount</span>
                  <span className={styles.discount}>
                    -£{selectedOrder.discount.toFixed(2)}
                  </span>
                </div>
              )}
              {isEditingItems &&
              selectedOrder.isManualImport &&
              selectedOrder.usesImportedBasePricing ? (
                <div className={styles.totalRow}>
                  <span>Imported Base Total</span>
                  <span>£{draftImportedBaseTotal.toFixed(2)}</span>
                </div>
              ) : null}
              <div className={`${styles.totalRow} ${styles.grandTotal}`}>
                <span>Total</span>
                <span>
                  £
                  {(isEditingItems ? draftTotal : selectedOrder.total).toFixed(
                    2,
                  )}
                </span>
              </div>
              {selectedOrder.paymentStatus === "partially_paid" &&
                typeof selectedOrder.amountPaid === "number" && (
                  <>
                    <div className={styles.totalRow}>
                      <span>Amount Paid</span>
                      <span>£{selectedOrder.amountPaid.toFixed(2)}</span>
                    </div>
                    <div className={styles.totalRow}>
                      <span>Remaining</span>
                      <span
                        style={{ color: "var(--color-warning-600, #b45309)" }}
                      >
                        £
                        {Math.max(
                          0,
                          selectedOrder.total - selectedOrder.amountPaid,
                        ).toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
              {typeof selectedOrder.amountRefunded === "number" &&
                selectedOrder.amountRefunded > 0 && (
                  <>
                    <div className={styles.totalRow}>
                      <span>Amount Refunded</span>
                      <span>-£{selectedOrder.amountRefunded.toFixed(2)}</span>
                    </div>
                    <div className={`${styles.totalRow} ${styles.grandTotal}`}>
                      <span>After Refund</span>
                      <span>
                        £
                        {Math.max(
                          0,
                          selectedOrder.total - selectedOrder.amountRefunded,
                        ).toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
            </div>

            {(selectedOrder.customerNotes ||
              selectedOrder.internalNotes ||
              customerInstructions ||
              deliveryNote) && (
              <div className={styles.notesSection}>
                {customerInstructions && (
                  <div className={styles.noteBox}>
                    <h5>Customer Instructions</h5>
                    <p>{customerInstructions}</p>
                  </div>
                )}
                {deliveryNote && (
                  <div className={styles.noteBox}>
                    <h5>Delivery Note</h5>
                    <p>{deliveryNote}</p>
                  </div>
                )}
                {selectedOrder.customerNotes && (
                  <div className={styles.noteBox}>
                    <h5>Customer Notes</h5>
                    <p>{selectedOrder.customerNotes}</p>
                  </div>
                )}
                {selectedOrder.internalNotes && (
                  <div className={`${styles.noteBox} ${styles.internalNote}`}>
                    <h5>Internal Notes</h5>
                    <p>{selectedOrder.internalNotes}</p>
                  </div>
                )}
              </div>
            )}

            <div className={styles.historySection}>
              <h4 className={styles.detailTitle}>Order Timeline</h4>
              <div className={styles.timeline}>
                {selectedOrder.history.map((entry: any, index: number) => (
                  <div key={index} className={styles.timelineItem}>
                    <div className={styles.timelineDot} />
                    <div className={styles.timelineContent}>
                      <span className={styles.timelineStatus}>
                        {entry.status.replace(/_/g, " ")}
                      </span>
                      <span className={styles.timelineMeta}>
                        {new Date(entry.timestamp).toLocaleString("en-GB")} •{" "}
                        {entry.user}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {proofUrl ? (
                <div className={styles.detailSection}>
                  <h4 className={styles.detailTitle}>Delivered</h4>
                  <p className={styles.detailText}>At: {deliveredAtLabel}</p>
                  <a
                    href={proofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.deliveryProofLink}
                  >
                    <img
                      src={proofUrl}
                      alt="Delivery proof"
                      className={styles.deliveryProofImage}
                      loading="lazy"
                    />
                    <span className={styles.deliveryProofLinkText}>
                      Open full size
                    </span>
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div style={{ padding: "var(--space-4)" }}>Loading order…</div>
        )}

        <ModalFooter>
          <Button variant="outline" onClick={() => setIsDetailModalOpen(false)}>
            Close
          </Button>
          {canUpdatePaymentPermission ? (
            <Button
              variant="outline"
              disabled={!canTogglePaymentStatus || isUpdatingPayment}
              isLoading={isUpdatingPayment}
              onClick={async () => {
                if (!canTogglePaymentStatus) return;
                const markingPaid = !isPaid;
                setNextPaidValue(markingPaid);
                if (markingPaid) {
                  setPaymentMode("full");
                  setCustomPayAmount("");
                }
                setIsPaymentConfirmOpen(true);
              }}
            >
              {isPaid ? "Mark Unpaid" : "Mark Paid"}
            </Button>
          ) : null}
          {canRefundPermission ? (
            <Button
              variant="danger"
              disabled={!canRefund}
              onClick={() => {
                if (!canRefund) return;
                setRefundAmount("");
                setIsRefundConfirmOpen(true);
              }}
            >
              Refund
            </Button>
          ) : null}
          {canUpdatePermission &&
            typeof setIsStatusModalOpen === "function" && (
              <Button
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setIsStatusModalOpen(true);
                }}
              >
                Update Status
              </Button>
            )}
        </ModalFooter>
      </Modal>

      {canRefundPermission ? (
        <Modal
          isOpen={isRefundConfirmOpen}
          onClose={() => {
            if (!isRefunding) setIsRefundConfirmOpen(false);
          }}
          title="Confirm refund"
          size="sm"
        >
          <p>
            Refund order {selectedOrder?.orderNumber || ""}? This action cannot
            be undone.
          </p>

          <div
            className={styles.filterGroup}
            style={{ marginTop: "var(--space-3)" }}
          >
            <label className={styles.filterLabel} htmlFor="refundAmount">
              Refund amount (optional)
            </label>
            <input
              id="refundAmount"
              className={styles.filterInput}
              type="number"
              inputMode="decimal"
              min={0}
              step={0.01}
              placeholder={
                typeof selectedOrder?.refundableRemaining === "number"
                  ? `Leave blank for full (£${selectedOrder.refundableRemaining.toFixed(2)})`
                  : "Leave blank for full refund"
              }
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              disabled={isRefunding}
            />
          </div>

          {typeof selectedOrder?.refundedTotal === "number" &&
          typeof selectedOrder?.refundableRemaining === "number" ? (
            <p
              style={{
                marginTop: "var(--space-2)",
                color: "var(--color-gray-700)",
              }}
            >
              Refunded so far: £{selectedOrder.refundedTotal.toFixed(2)} •
              Remaining: £{selectedOrder.refundableRemaining.toFixed(2)}
            </p>
          ) : null}

          <ModalFooter>
            <Button
              variant="outline"
              disabled={isRefunding}
              onClick={() => setIsRefundConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={isRefunding}
              onClick={async () => {
                if (!selectedOrder?.id) return;
                setIsRefunding(true);
                try {
                  const raw = String(refundAmount || "").trim();
                  const parsed = raw ? Number(raw) : undefined;
                  const amountToRefund =
                    typeof parsed === "number" &&
                    Number.isFinite(parsed) &&
                    parsed > 0
                      ? parsed
                      : undefined;

                  await refundOrder?.(selectedOrder.id, amountToRefund);
                  setIsRefundConfirmOpen(false);
                  setIsDetailModalOpen(false);
                } finally {
                  setIsRefunding(false);
                }
              }}
            >
              Refund
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}

      {canUpdatePaymentPermission ? (
        <Modal
          isOpen={isPaymentConfirmOpen}
          onClose={() => {
            if (!isUpdatingPayment) setIsPaymentConfirmOpen(false);
          }}
          title={nextPaidValue ? "Mark as paid" : "Mark as unpaid"}
          size="sm"
        >
          {nextPaidValue ? (
            (() => {
              const orderTotal =
                typeof selectedOrder?.total === "number"
                  ? selectedOrder.total
                  : 0;
              const parsedCustom = Number(customPayAmount);
              const customIsValid =
                customPayAmount.trim() !== "" &&
                Number.isFinite(parsedCustom) &&
                parsedCustom >= 0;
              const effectiveAmount =
                paymentMode === "full"
                  ? orderTotal
                  : customIsValid
                    ? parsedCustom
                    : null;
              const isPartial =
                effectiveAmount !== null &&
                orderTotal > 0 &&
                effectiveAmount < orderTotal;
              const remaining =
                effectiveAmount !== null
                  ? Math.max(0, orderTotal - effectiveAmount)
                  : null;

              return (
                <>
                  <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>
                      Amount received
                    </label>
                    <div
                      style={{
                        display: "flex",
                        gap: "var(--space-2)",
                        marginBottom: "var(--space-3)",
                      }}
                    >
                      <Button
                        size="sm"
                        variant={paymentMode === "full" ? "primary" : "outline"}
                        onClick={() => setPaymentMode("full")}
                        disabled={isUpdatingPayment}
                      >
                        Full — £{orderTotal.toFixed(2)}
                      </Button>
                      <Button
                        size="sm"
                        variant={
                          paymentMode === "custom" ? "primary" : "outline"
                        }
                        onClick={() => setPaymentMode("custom")}
                        disabled={isUpdatingPayment}
                      >
                        Custom amount
                      </Button>
                    </div>
                    {paymentMode === "custom" && (
                      <input
                        className={styles.filterInput}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.01}
                        placeholder={`e.g. ${(orderTotal / 2).toFixed(2)}`}
                        value={customPayAmount}
                        onChange={(e) => setCustomPayAmount(e.target.value)}
                        disabled={isUpdatingPayment}
                        autoFocus
                      />
                    )}
                  </div>
                  {paymentMode === "custom" && customIsValid && (
                    <p
                      style={{
                        fontSize: "var(--text-sm)",
                        color: isPartial
                          ? "var(--color-warning-600, #b45309)"
                          : "var(--color-success-600, #16a34a)",
                        marginTop: "var(--space-1)",
                      }}
                    >
                      {isPartial
                        ? `Partially paid — £${remaining!.toFixed(2)} outstanding`
                        : "Paid in full"}
                    </p>
                  )}
                </>
              );
            })()
          ) : (
            <p>Mark order {selectedOrder?.orderNumber || ""} as unpaid?</p>
          )}

          <ModalFooter>
            <Button
              variant="outline"
              disabled={isUpdatingPayment}
              onClick={() => setIsPaymentConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              isLoading={isUpdatingPayment}
              disabled={(() => {
                if (
                  isUpdatingPayment ||
                  !canTogglePaymentStatus ||
                  !selectedOrder?.id ||
                  typeof nextPaidValue !== "boolean"
                )
                  return true;
                if (nextPaidValue && paymentMode === "custom") {
                  const v = Number(customPayAmount);
                  return (
                    customPayAmount.trim() === "" ||
                    !Number.isFinite(v) ||
                    v < 0
                  );
                }
                return false;
              })()}
              onClick={async () => {
                if (!selectedOrder?.id) return;
                if (typeof nextPaidValue !== "boolean") return;
                if (!canTogglePaymentStatus) return;

                let amountPaid: number | undefined;
                if (nextPaidValue) {
                  if (paymentMode === "custom") {
                    amountPaid = Number(customPayAmount);
                  }
                  // paymentMode === "full" → amountPaid undefined (server defaults to total)
                }

                setIsUpdatingPayment(true);
                try {
                  await updateOrderPaymentStatus?.(
                    selectedOrder.id,
                    nextPaidValue,
                    amountPaid,
                  );
                  setIsPaymentConfirmOpen(false);
                } finally {
                  setIsUpdatingPayment(false);
                }
              }}
            >
              Confirm
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </>
  );
};

export default OrderDetailModal;
