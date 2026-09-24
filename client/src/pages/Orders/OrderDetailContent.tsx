import { Button, Modal, ModalFooter, Table } from "../../components/common";
import styles from "./Orders.module.css";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ImageIcon, Package, Wallet } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useVariantSearch } from "../Discounts/useVariantSearch";

const OrderDetailContent = ({
  heading,
  statusEditor,
  isStatusEditorOpen,
  selectedOrder,
  setIsStatusModalOpen,
  updateOrderPaymentStatus,
  updateOrderItems,
  updateDriverNote,
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
  const [isProofModalOpen, setIsProofModalOpen] = useState(false);
  const [nextPaidValue, setNextPaidValue] = useState<boolean | null>(null);
  const [paymentMode, setPaymentMode] = useState<"full" | "custom">("full");
  const [customPayAmount, setCustomPayAmount] = useState<string>("");

  const [isEditingItems, setIsEditingItems] = useState(false);
  const [isSavingItems, setIsSavingItems] = useState(false);
  const [includeDeliveryFeeInTotal, setIncludeDeliveryFeeInTotal] =
    useState(true);

  const [driverNoteDraft, setDriverNoteDraft] = useState("");
  const [isEditingDriverNote, setIsEditingDriverNote] = useState(false);
  const [isSavingDriverNote, setIsSavingDriverNote] = useState(false);
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
    if (!selectedOrder) {
      setIsEditingItems(false);
      setIsSavingItems(false);
      setIncludeDeliveryFeeInTotal(true);
      setDraftItems([]);
      variantSearch.setQuery("");
      return;
    }

    // Reset drafts when a different order is loaded.
    setIsEditingItems(false);
    setIsSavingItems(false);
    setIncludeDeliveryFeeInTotal(
      Boolean(selectedOrder?.includeDeliveryFeeInTotal ?? true),
    );
    setDraftItems([]);
    variantSearch.setQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
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

  const sortedHistory = useMemo(
    () => [...(selectedOrder?.history || [])].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    ),
    [selectedOrder?.history],
  );

  const deliveryNote =
    typeof selectedOrder?.deliveryNote === "string"
      ? selectedOrder.deliveryNote.trim()
      : "";

  const customerInstructions =
    typeof selectedOrder?.customerInstructions === "string"
      ? selectedOrder.customerInstructions.trim()
      : "";

  const customerNote = customerInstructions ||
    (typeof selectedOrder?.customerNotes === "string"
      ? selectedOrder.customerNotes.trim()
      : "");

  const deliveredAtIso =
    typeof selectedOrder?.deliveredAt === "string"
      ? selectedOrder.deliveredAt
      : selectedOrder?.deliveryStatus === "delivered"
        ? selectedOrder?.updatedAt
        : null;

  const deliveredAtLabel = deliveredAtIso
    ? new Date(deliveredAtIso).toLocaleString("en-GB")
    : "—";

  const financialActions = (
    <div className={styles.financialActions} aria-label="Payment actions">
      {canUpdatePaymentPermission ? (
        <Button
          variant="outline"
          disabled={!canTogglePaymentStatus || isUpdatingPayment}
          title={!canTogglePaymentStatus ? "Payment status can only be changed for imported orders without online payments." : undefined}
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
          variant="ghost"
          className={styles.refundTextAction}
          disabled={!canRefund}
          title={!canRefund ? "Refunds are available for eligible online payments." : undefined}
          onClick={() => {
            if (!canRefund) return;
            setRefundAmount("");
            setIsRefundConfirmOpen(true);
          }}
        >
          Refund
        </Button>
      ) : null}
    </div>
  );

  return (
    <>
      <div className={styles.orderHero}>
        {heading}
        {selectedOrder && <dl className={styles.orderSummary}>
          <div><dt><Wallet size={17} aria-hidden="true" /> Order total</dt><dd>£{selectedOrder.total.toFixed(2)}</dd></div>
          <div><dt><CalendarDays size={17} aria-hidden="true" /> Delivery date</dt><dd>{new Date(selectedOrder.deliverySlot.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</dd></div>
          <div><dt><Package size={17} aria-hidden="true" /> Items to deliver</dt><dd>{selectedOrder.items.reduce((sum: number, item: any) => sum + item.quantity, 0)} <span>units · {selectedOrder.items.length} {selectedOrder.items.length === 1 ? "product" : "products"}</span></dd></div>
        </dl>}
      </div>
        {selectedOrder ? (
          <div className={`${styles.orderDetail} ${styles.pageOrderDetail}`}>
            <div className={styles.detailGrid}>
              <div className={styles.detailSection}>
                <h2 className={styles.detailTitle}>Customer</h2>
                <p>{selectedOrder.customer.name}</p>
                <p>{selectedOrder.customer.email}</p>
                <p>{selectedOrder.customer.phone}</p>
              </div>

              <div className={styles.detailSection}>
                <h2 className={styles.detailTitle}>Delivery Address</h2>
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
                <h2 className={styles.detailTitle}>Delivery Slot</h2>
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

            <section id="order-items" className={styles.itemsSection}>
              <div className={styles.itemsHeaderRow}>
                <h2 className={styles.detailTitle}>Order items <span className={styles.itemHeadingCount}>{selectedOrder.items.reduce((sum: number, item: any) => sum + item.quantity, 0)}</span></h2>
              </div>
              <Table withWrapper={false} tableClassName={styles.itemsTable}>
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
                              aria-label={`Quantity for ${item.name}`}
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
              </Table>

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
            <div className={styles.totalsSection} aria-label="Order totals">
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
            {financialActions}
            </section>

              <section className={styles.notesSection} aria-labelledby="order-notes-heading">
                <div className={styles.notesHeader}>
                  <h2 id="order-notes-heading">Notes</h2>
                </div>
                <div className={styles.noteBox}>
                  <h5>Customer note</h5>
                  <p className={!customerNote ? styles.noteEmpty : undefined}>
                    {customerNote || "No customer note provided"}
                  </p>
                </div>
                {deliveryNote && (
                  <div className={styles.noteBox}>
                    <h5>Delivery Note</h5>
                    <p>{deliveryNote}</p>
                  </div>
                )}
                {selectedOrder.internalNotes && (
                  <div className={`${styles.noteBox} ${styles.internalNote}`}>
                    <h5>Internal Notes</h5>
                    <p>{selectedOrder.internalNotes}</p>
                  </div>
                )}

            {canUpdatePermission && (
                <div className={`${styles.noteBox} ${styles.internalNote}`}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "var(--space-2)",
                    }}
                  >
                    <h5 style={{ margin: 0 }}>Driver Note</h5>
                    {!isEditingDriverNote && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDriverNoteDraft(selectedOrder.driverNote || "");
                          setIsEditingDriverNote(true);
                        }}
                      >
                        {selectedOrder.driverNote ? "Edit" : "Add note"}
                      </Button>
                    )}
                  </div>
                  {isEditingDriverNote ? (
                    <>
                      <textarea
                        className={styles.driverNoteTextarea}
                        aria-label="Driver note"
                        rows={3}
                        maxLength={500}
                        value={driverNoteDraft}
                        onChange={(e) => setDriverNoteDraft(e.target.value)}
                        placeholder="Note for the driver (visible on delivery run)…"
                        disabled={isSavingDriverNote}
                      />
                      <div
                        className={styles.driverNoteActions}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isSavingDriverNote}
                          onClick={() => setIsEditingDriverNote(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          isLoading={isSavingDriverNote}
                          disabled={isSavingDriverNote}
                          onClick={async () => {
                            if (!selectedOrder?.id) return;
                            setIsSavingDriverNote(true);
                            try {
                              const updated = await updateDriverNote?.(
                                selectedOrder.id,
                                driverNoteDraft.trim() || null,
                              );
                              if (updated) setIsEditingDriverNote(false);
                            } finally {
                              setIsSavingDriverNote(false);
                            }
                          }}
                        >
                          Save
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p
                      style={{
                        color: selectedOrder.driverNote
                          ? undefined
                          : "var(--color-gray-500)",

                      }}
                    >
                      {selectedOrder.driverNote || "No driver note set"}
                    </p>
                  )}
                </div>
            )}
              </section>

            <div id="order-activity" className={styles.historySection}>
              <div className={styles.auditSectionHeader}>
                <div>
                  <h2>Order status audit</h2>
                  <p>Every recorded delivery-status change, who made it, and what it triggered.</p>
                </div>
                <div className={styles.auditHeaderActions}>
                  {statusEditor}
                  {proofUrl ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsProofModalOpen(true)}
                    >
                      <ImageIcon size={15} aria-hidden="true" />
                      View delivery proof
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className={styles.timeline}>
                <article className={`${styles.timelineItem} ${styles.timeline_ordered}`}>
                  <div className={`${styles.timelineDot} ${sortedHistory.length === 0 ? styles.timelineDotCurrent : ""}`} />
                  <div className={styles.timelineContent}>
                    <div className={styles.timelineStatusRow}>
                      <span className={styles.timelineStatus}><strong>Ordered</strong></span>
                      <time dateTime={selectedOrder.createdAt}>{new Date(selectedOrder.createdAt).toLocaleString("en-GB")}</time>
                    </div>
                    <span className={styles.timelineActor}>Order created with initial status</span>
                  </div>
                </article>
                {sortedHistory.map((entry, index: number) => {
                  const statusKey = String(entry.status || "")
                    .toLowerCase()
                    .replace(/\s+/g, "_");
                  const isCurrent = index === sortedHistory.length - 1;
                  return (
                  <article key={entry.id || index} className={`${styles.timelineItem} ${styles[`timeline_${statusKey}`] || styles.timeline_default}`}>
                    <div className={`${styles.timelineDot} ${isCurrent ? styles.timelineDotCurrent : ""}`} />
                    <div className={styles.timelineContent}>
                      <div className={styles.timelineStatusRow}>
                        <span className={styles.timelineStatus}>
                          <strong>{entry.status.replace(/_/g, " ")}</strong>
                        </span>
                        <time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString("en-GB")}</time>
                      </div>
                      <span className={styles.timelineActor}>
                        Changed by <strong>{entry.user}</strong>
                        {entry.role ? <> · {entry.role}</> : null}
                        {entry.source && entry.source.toLowerCase() !== entry.role?.toLowerCase()
                          ? <> · {entry.source.replace(/_/g, " ")}</>
                          : null}
                      </span>
                      {entry.effects?.length ? (
                        <div className={styles.timelineAutomation}>
                          <span>Triggered</span>
                          <ul className={styles.timelineEffects}>
                            {entry.effects.map((effect: string) => <li key={effect}>{effect}</li>)}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </article>
                )})}
              </div>
              <div id="order-status-footer" className={styles.orderStatusFooterSlot} />
            </div>
          </div>
        ) : (
          <div style={{ padding: "var(--space-4)" }}>Loading order…</div>
        )}


      {proofUrl ? (
        <Modal
          isOpen={isProofModalOpen}
          onClose={() => setIsProofModalOpen(false)}
          title="Delivery proof"
          size="xl"
        >
          <div className={styles.deliveryProofModal}>
            <div className={styles.deliveryProofModalMeta}>
              <div>
                <strong>Delivered order</strong>
                <span>{selectedOrder?.orderNumber}</span>
              </div>
              <div>
                <strong>Delivery recorded</strong>
                <span>{deliveredAtLabel}</span>
              </div>
            </div>
            <div className={styles.deliveryProofModalCanvas}>
              <img src={proofUrl} alt={`Delivery proof for ${selectedOrder?.orderNumber || "order"}`} />
            </div>
          </div>
          <ModalFooter>
            <Button variant="outline" onClick={() => setIsProofModalOpen(false)}>
              Close
            </Button>
            <Button onClick={() => window.open(proofUrl, "_blank", "noopener,noreferrer")}>
              Open original
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}

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

                  const updated = await refundOrder?.(selectedOrder.id, amountToRefund);
                  if (updated) setIsRefundConfirmOpen(false);
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
                  const updated = await updateOrderPaymentStatus?.(
                    selectedOrder.id,
                    nextPaidValue,
                    amountPaid,
                  );
                  if (updated) setIsPaymentConfirmOpen(false);
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

export default OrderDetailContent;
