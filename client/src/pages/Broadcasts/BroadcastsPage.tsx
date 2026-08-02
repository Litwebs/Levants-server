import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Filter,
  Mail,
  Megaphone,
  Plus,
  Search,
  Send,
  Users,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Input,
  Modal,
  ModalFooter,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/common";
import { useToast } from "@/components/common/Toast";
import {
  type AudiencePreview,
  type Broadcast,
  type BroadcastAudience,
  type BroadcastAudienceOptions,
  getBroadcastAudienceOptions,
  previewBroadcastAudience,
} from "@/context/Broadcasts/broadcastsApi";
import { usePermissions } from "@/hooks/usePermissions";
import { useBroadcasts } from "./useBroadcasts";
import styles from "./BroadcastsPage.module.css";

const EMPTY_AUDIENCE: BroadcastAudience = {
  customerTypes: [],
  postcodes: [],
  marketingPreference: "any",
  orderStatuses: [],
  deliveryStatuses: [],
  orderTypes: [],
  productIds: [],
  variantIds: [],
  hasSubscription: "any",
  subscriptionStatuses: [],
  subscriptionFrequencies: [],
  deliveryDays: [],
};

type BroadcastDraft = {
  title: string;
  description: string;
  expiresAt: string;
  messageType: Broadcast["messageType"];
  audience: BroadcastAudience;
};

const emptyDraft = (): BroadcastDraft => ({
  title: "",
  description: "",
  expiresAt: "",
  messageType: "operational",
  audience: { ...EMPTY_AUDIENCE },
});

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const toDateInput = (value?: string) => (value ? value.slice(0, 10) : "");
const toDateTimeInput = (value?: string) =>
  value ? new Date(value).toISOString().slice(0, 16) : "";

const getErrorMessage = (error: unknown, fallback: string) => {
  const candidate = error as { response?: { data?: { message?: string } } };
  return candidate?.response?.data?.message || fallback;
};

const getEmailBadge = (status?: Broadcast["emailStatus"]) => {
  if (status === "sent") return <Badge variant="success">Sent</Badge>;
  if (status === "sending") return <Badge variant="default">Sending</Badge>;
  if (status === "failed") return <Badge variant="error">Failed</Badge>;
  if (status === "partial") return <Badge variant="warning">Partial</Badge>;
  return <Badge variant="default">Draft</Badge>;
};

function selectedFilterCount(audience: BroadcastAudience) {
  return (
    audience.customerTypes.length +
    audience.postcodes.length +
    audience.orderStatuses.length +
    audience.deliveryStatuses.length +
    audience.orderTypes.length +
    audience.productIds.length +
    audience.variantIds.length +
    audience.subscriptionStatuses.length +
    audience.subscriptionFrequencies.length +
    audience.deliveryDays.length +
    (audience.joinedFrom ? 1 : 0) +
    (audience.joinedTo ? 1 : 0) +
    (audience.lastOrderFrom ? 1 : 0) +
    (audience.lastOrderTo ? 1 : 0) +
    (audience.orderedFrom ? 1 : 0) +
    (audience.orderedTo ? 1 : 0) +
    (audience.marketingPreference !== "any" ? 1 : 0) +
    (audience.hasSubscription !== "any" ? 1 : 0)
  );
}

type Choice = { value: string; label: string };

const ChoiceGroup = ({
  label,
  choices,
  selected,
  onChange,
}: {
  label: string;
  choices: Choice[];
  selected: string[];
  onChange: (values: string[]) => void;
}) => (
  <fieldset className={styles.choiceFieldset}>
    <legend>{label}</legend>
    <div className={styles.choiceGrid}>
      {choices.map((choice) => {
        const checked = selected.includes(choice.value);
        return (
          <label
            key={choice.value}
            className={`${styles.choice} ${checked ? styles.choiceSelected : ""}`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() =>
                onChange(
                  checked
                    ? selected.filter((value) => value !== choice.value)
                    : [...selected, choice.value],
                )
              }
            />
            <span className={styles.choiceCheck} aria-hidden="true">
              {checked && <Check size={13} />}
            </span>
            {choice.label}
          </label>
        );
      })}
    </div>
  </fieldset>
);

const SearchableChoiceList = ({
  label,
  hint,
  choices,
  selected,
  onChange,
}: {
  label: string;
  hint: string;
  choices: Choice[];
  selected: string[];
  onChange: (values: string[]) => void;
}) => {
  const [query, setQuery] = useState("");
  const visible = choices
    .filter((choice) => choice.label.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 80);

  return (
    <fieldset className={styles.listFieldset}>
      <legend>{label}</legend>
      <span className={styles.fieldHint}>{hint}</span>
      <div className={styles.optionSearch}>
        <Search size={15} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${label.toLowerCase()}…`}
          aria-label={`Search ${label.toLowerCase()}`}
        />
      </div>
      {selected.length > 0 && (
        <div className={styles.selectionSummary}>
          <span>{selected.length} selected</span>
          <button type="button" onClick={() => onChange([])}>
            Clear
          </button>
        </div>
      )}
      <div className={styles.optionList}>
        {visible.length === 0 ? (
          <span className={styles.muted}>No matches found.</span>
        ) : (
          visible.map((choice) => (
            <label key={choice.value} className={styles.optionRow}>
              <input
                type="checkbox"
                checked={selected.includes(choice.value)}
                onChange={() =>
                  onChange(
                    selected.includes(choice.value)
                      ? selected.filter((value) => value !== choice.value)
                      : [...selected, choice.value],
                  )
                }
              />
              <span>{choice.label}</span>
            </label>
          ))
        )}
      </div>
    </fieldset>
  );
};

const AudiencePreviewPanel = ({
  preview,
  loading,
  messageType,
  filterCount,
}: {
  preview: AudiencePreview | null;
  loading: boolean;
  messageType: Broadcast["messageType"];
  filterCount: number;
}) => (
  <aside className={styles.previewPanel} aria-live="polite" aria-busy={loading}>
    <div className={styles.previewEyebrow}>
      <Users size={16} /> Audience preview
    </div>
    <div className={styles.recipientCount}>
      {loading ? "…" : (preview?.totalRecipients ?? 0)}
    </div>
    <div className={styles.recipientLabel}>
      unique customer{preview?.totalRecipients === 1 ? "" : "s"} with email
    </div>
    <div className={styles.previewBreakdown}>
      <span>
        <strong>{preview?.breakdown.accounts ?? 0}</strong> accounts
      </span>
      <span>
        <strong>{preview?.breakdown.guests ?? 0}</strong> guests
      </span>
    </div>
    <div className={styles.audienceRule}>
      <Filter size={15} />
      {filterCount
        ? `${filterCount} audience filter${filterCount === 1 ? "" : "s"} applied`
        : "All active customers"}
    </div>
    {messageType === "marketing" && (
      <div className={styles.complianceNote}>
        Marketing opt-in is required automatically. This safeguard cannot be
        removed by another filter.
      </div>
    )}
    {!!preview?.sample.length && (
      <div className={styles.sampleList}>
        <div className={styles.sampleTitle}>Example recipients</div>
        {preview.sample.slice(0, 3).map((recipient) => (
          <div key={recipient.email} className={styles.sampleRecipient}>
            <span>
              {[recipient.firstName, recipient.lastName].filter(Boolean).join(" ") ||
                "Customer"}
            </span>
            <small>{recipient.email}</small>
          </div>
        ))}
      </div>
    )}
  </aside>
);

export const BroadcastsPage = () => {
  const { showToast } = useToast();
  const { hasPermission } = usePermissions();
  const { broadcasts, loading, saving, create, update, remove, send } =
    useBroadcasts();
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState<BroadcastDraft>(emptyDraft);
  const [editTarget, setEditTarget] = useState<Broadcast | null>(null);
  const [sendTarget, setSendTarget] = useState<Broadcast | null>(null);
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [options, setOptions] = useState<BroadcastAudienceOptions>({
    products: [],
    variants: [],
  });

  const canCreate = hasPermission("broadcasts.create");
  const canUpdate = hasPermission("broadcasts.update");
  const canDelete = hasPermission("broadcasts.delete");
  const canSend = hasPermission("broadcasts.send");
  const filterCount = selectedFilterCount(draft.audience);

  useEffect(() => {
    getBroadcastAudienceOptions()
      .then(setOptions)
      .catch(() =>
        showToast({
          title: "Options unavailable",
          message: "Product filters could not be loaded. Other filters still work.",
          type: "warning",
        }),
      );
  }, [showToast]);

  useEffect(() => {
    if (!composerOpen && !editTarget) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const result = await previewBroadcastAudience(
          draft.audience,
          draft.messageType,
        );
        if (active) setPreview(result);
      } catch {
        if (active) setPreview(null);
      } finally {
        if (active) setPreviewLoading(false);
      }
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [composerOpen, editTarget, draft.audience, draft.messageType]);

  const productChoices = useMemo(
    () => options.products.map((product) => ({ value: product._id, label: product.name })),
    [options.products],
  );
  const variantChoices = useMemo(
    () =>
      options.variants.map((variant) => ({
        value: variant._id,
        label: `${variant.productName} · ${variant.name} · ${variant.sku}`,
      })),
    [options.variants],
  );

  const closeComposer = () => {
    setComposerOpen(false);
    setEditTarget(null);
    setDraft(emptyDraft());
    setPreview(null);
  };

  const openCreate = () => {
    setDraft(emptyDraft());
    setEditTarget(null);
    setComposerOpen(true);
  };

  const openEdit = (broadcast: Broadcast) => {
    setEditTarget(broadcast);
    setDraft({
      title: broadcast.title,
      description: broadcast.description,
      expiresAt: toDateTimeInput(broadcast.expiresAt),
      messageType: broadcast.messageType || "operational",
      audience: { ...EMPTY_AUDIENCE, ...(broadcast.audience || {}) },
    });
    setComposerOpen(true);
  };

  const updateAudience = <K extends keyof BroadcastAudience>(
    key: K,
    value: BroadcastAudience[K],
  ) => setDraft((current) => ({
    ...current,
    audience: { ...current.audience, [key]: value },
  }));

  const saveDraft = async () => {
    try {
      const payload = {
        title: draft.title.trim(),
        description: draft.description.trim(),
        expiresAt: draft.expiresAt || undefined,
        messageType: draft.messageType,
        audience: draft.audience,
      };
      if (editTarget) await update(editTarget._id, payload);
      else await create(payload);
      closeComposer();
      showToast({
        title: editTarget ? "Broadcast updated" : "Broadcast created",
        message: "The audience and message are saved and ready to review.",
        type: "success",
      });
    } catch (error) {
      showToast({
        title: "Could not save broadcast",
        message: getErrorMessage(error, "Review the details and try again."),
        type: "error",
      });
    }
  };

  const openSendConfirmation = async (broadcast: Broadcast) => {
    setSendTarget(broadcast);
    setPreviewLoading(true);
    try {
      setPreview(
        await previewBroadcastAudience(
          broadcast.audience || EMPTY_AUDIENCE,
          broadcast.messageType || "operational",
        ),
      );
    } catch (error) {
      setPreview(null);
      showToast({
        title: "Could not check audience",
        message: getErrorMessage(error, "Close this dialog and try again."),
        type: "error",
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmSend = async () => {
    if (!sendTarget || !preview?.totalRecipients) return;
    try {
      await send(sendTarget._id);
      setSendTarget(null);
      setPreview(null);
      showToast({
        title: "Broadcast sent",
        message: `The email was sent to ${preview.totalRecipients} customer${preview.totalRecipients === 1 ? "" : "s"}.`,
        type: "success",
      });
    } catch (error) {
      showToast({
        title: "Send failed",
        message: getErrorMessage(error, "The broadcast was not fully sent."),
        type: "error",
      });
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Broadcasts</h1>
          <p className={styles.subtitle}>
            Send relevant service updates and campaigns to a previewed customer audience.
          </p>
        </div>
        {canCreate && (
          <Button onClick={openCreate} leftIcon={<Plus size={17} />}>
            New broadcast
          </Button>
        )}
      </div>

      <Card>
        {loading ? (
          <div className={styles.loading}>Loading broadcasts…</div>
        ) : broadcasts.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}><Megaphone size={23} /></span>
            <h2>No broadcasts yet</h2>
            <p>Create a message, choose its audience, and verify the recipient count before sending.</p>
            {canCreate && <Button onClick={openCreate}>Create your first broadcast</Button>}
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <Table tableClassName={styles.broadcastTable}>
              <TableHeader>
                <TableRow>
                  <TableHead>Broadcast</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead>Last sent</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead align="right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {broadcasts.map((broadcast) => {
                  const audienceCount =
                    broadcast.emailStatus === "not_sent"
                      ? broadcast.audienceSummary?.estimatedRecipients
                      : broadcast.emailStats?.totalRecipients;
                  return (
                    <TableRow key={broadcast._id}>
                      <TableCell data-label="Broadcast">
                        <div className={styles.broadcastTitle}>{broadcast.title}</div>
                        <div className={styles.messagePreview}>{broadcast.description}</div>
                      </TableCell>
                      <TableCell data-label="Status">{getEmailBadge(broadcast.emailStatus)}</TableCell>
                      <TableCell data-label="Audience">
                        <div className={styles.audienceCell}>
                          <strong>{audienceCount ?? 0}</strong>
                          <span>
                            {selectedFilterCount({ ...EMPTY_AUDIENCE, ...(broadcast.audience || {}) })
                              ? "filtered recipients"
                              : "active customers"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell data-label="Last sent">{formatDate(broadcast.emailedAt)}</TableCell>
                      <TableCell data-label="Created">{formatDate(broadcast.createdAt)}</TableCell>
                      <TableCell data-label="Actions" align="right">
                        <div className={styles.actions}>
                          {canUpdate && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(broadcast)}
                              disabled={saving || broadcast.emailStatus === "sending"}
                            >
                              Edit
                            </Button>
                          )}
                          {canSend && (
                            <Button
                              size="sm"
                              leftIcon={<Send size={14} />}
                              onClick={() => openSendConfirmation(broadcast)}
                              disabled={saving || broadcast.emailStatus === "sending"}
                            >
                              Send
                            </Button>
                          )}
                          {canDelete && (
                            <Button size="sm" variant="ghost" onClick={() => remove(broadcast._id)} disabled={saving}>
                              Delete
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Modal
        isOpen={composerOpen}
        onClose={closeComposer}
        title={editTarget ? "Edit broadcast" : "Create broadcast"}
        size="xl"
      >
        <div className={styles.composerGrid}>
          <div className={styles.composerMain}>
            <section className={styles.composerSection} aria-labelledby="message-heading">
              <div className={styles.sectionHeader}>
                <span className={styles.stepNumber}>1</span>
                <div>
                  <h3 id="message-heading">Write your message</h3>
                  <p>Keep the title specific so it is easy to recognise later.</p>
                </div>
              </div>
              <div className={styles.form}>
                <Select
                  label="Message type"
                  fullWidth
                  value={draft.messageType}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      messageType: value as Broadcast["messageType"],
                    }))
                  }
                  options={[
                    { value: "operational", label: "Service or delivery update" },
                    { value: "marketing", label: "Promotion or marketing" },
                  ]}
                />
                <Input
                  label="Title"
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="e.g. Wednesday delivery time update"
                  maxLength={120}
                  fullWidth
                />
                <label className={styles.label}>
                  Message
                  <textarea
                    value={draft.description}
                    onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Write the update customers should receive…"
                    rows={5}
                    maxLength={2000}
                    className={styles.textarea}
                  />
                  <span className={styles.characterCount}>{draft.description.length} / 2,000</span>
                </label>
                <Input
                  label="Display expiry (optional)"
                  hint="Only used if this broadcast is also displayed as a storefront notice."
                  type="datetime-local"
                  value={draft.expiresAt}
                  onChange={(event) => setDraft((current) => ({ ...current, expiresAt: event.target.value }))}
                  fullWidth
                />
              </div>
            </section>

            <section className={styles.composerSection} aria-labelledby="audience-heading">
              <div className={styles.sectionHeader}>
                <span className={styles.stepNumber}>2</span>
                <div>
                  <h3 id="audience-heading">Choose your audience</h3>
                  <p>Leave every filter empty to include all active customers with an email address.</p>
                </div>
              </div>

              <details className={styles.filterGroup} open>
                <summary>
                  <span><Users size={17} /> Customer profile</span>
                  <ChevronRight size={17} className={styles.summaryChevron} />
                </summary>
                <div className={styles.filterContent}>
                  <ChoiceGroup
                    label="Customer type"
                    selected={draft.audience.customerTypes}
                    onChange={(value) => updateAudience("customerTypes", value as BroadcastAudience["customerTypes"])}
                    choices={[
                      { value: "account", label: "Account customers" },
                      { value: "guest", label: "Guest customers" },
                    ]}
                  />
                  <div className={styles.dateGrid}>
                    <Input label="Joined from" type="date" value={toDateInput(draft.audience.joinedFrom)} onChange={(event) => updateAudience("joinedFrom", event.target.value)} fullWidth />
                    <Input label="Joined to" type="date" value={toDateInput(draft.audience.joinedTo)} onChange={(event) => updateAudience("joinedTo", event.target.value)} fullWidth />
                    <Input label="Last order from" type="date" value={toDateInput(draft.audience.lastOrderFrom)} onChange={(event) => updateAudience("lastOrderFrom", event.target.value)} fullWidth />
                    <Input label="Last order to" type="date" value={toDateInput(draft.audience.lastOrderTo)} onChange={(event) => updateAudience("lastOrderTo", event.target.value)} fullWidth />
                  </div>
                  <Input
                    label="Postcodes"
                    hint="Separate exact postcodes with commas."
                    value={draft.audience.postcodes.join(", ")}
                    onChange={(event) => updateAudience("postcodes", event.target.value.split(",").map((value) => value.trim()).filter(Boolean))}
                    placeholder="BD4 9HG, BD9 4QQ"
                    fullWidth
                  />
                  {draft.messageType === "operational" && (
                    <Select
                      label="Marketing preference"
                      fullWidth
                      value={draft.audience.marketingPreference}
                      onChange={(value) => updateAudience("marketingPreference", value as BroadcastAudience["marketingPreference"])}
                      options={[
                        { value: "any", label: "Any preference" },
                        { value: "opted_in", label: "Opted in" },
                        { value: "opted_out", label: "Not opted in" },
                      ]}
                    />
                  )}
                </div>
              </details>

              <details className={styles.filterGroup}>
                <summary>
                  <span><Mail size={17} /> Orders and products</span>
                  <ChevronRight size={17} className={styles.summaryChevron} />
                </summary>
                <div className={styles.filterContent}>
                  <ChoiceGroup
                    label="Order type"
                    selected={draft.audience.orderTypes}
                    onChange={(value) => updateAudience("orderTypes", value as BroadcastAudience["orderTypes"])}
                    choices={[
                      { value: "one_time", label: "One-time order" },
                      { value: "subscription_generated", label: "Subscription order" },
                    ]}
                  />
                  <ChoiceGroup
                    label="Payment status"
                    selected={draft.audience.orderStatuses}
                    onChange={(value) => updateAudience("orderStatuses", value)}
                    choices={[
                      { value: "paid", label: "Paid" },
                      { value: "unpaid", label: "Unpaid" },
                      { value: "partially_paid", label: "Partially paid" },
                      { value: "refunded", label: "Refunded" },
                      { value: "cancelled", label: "Cancelled" },
                      { value: "failed", label: "Failed" },
                    ]}
                  />
                  <ChoiceGroup
                    label="Delivery status"
                    selected={draft.audience.deliveryStatuses}
                    onChange={(value) => updateAudience("deliveryStatuses", value)}
                    choices={[
                      { value: "ordered", label: "Ordered" },
                      { value: "dispatched", label: "Dispatched" },
                      { value: "in_transit", label: "In transit" },
                      { value: "delivered", label: "Delivered" },
                      { value: "returned", label: "Returned" },
                    ]}
                  />
                  <div className={styles.dateGrid}>
                    <Input label="Ordered from" type="date" value={toDateInput(draft.audience.orderedFrom)} onChange={(event) => updateAudience("orderedFrom", event.target.value)} fullWidth />
                    <Input label="Ordered to" type="date" value={toDateInput(draft.audience.orderedTo)} onChange={(event) => updateAudience("orderedTo", event.target.value)} fullWidth />
                  </div>
                  <div className={styles.optionColumns}>
                    <SearchableChoiceList label="Products" hint="Purchased or included in a subscription." choices={productChoices} selected={draft.audience.productIds} onChange={(value) => updateAudience("productIds", value)} />
                    <SearchableChoiceList label="Variants" hint="Match a specific size or product option." choices={variantChoices} selected={draft.audience.variantIds} onChange={(value) => updateAudience("variantIds", value)} />
                  </div>
                </div>
              </details>

              <details className={styles.filterGroup}>
                <summary>
                  <span><Megaphone size={17} /> Subscriptions</span>
                  <ChevronRight size={17} className={styles.summaryChevron} />
                </summary>
                <div className={styles.filterContent}>
                  <Select
                    label="Subscription relationship"
                    fullWidth
                    value={draft.audience.hasSubscription}
                    onChange={(value) => updateAudience("hasSubscription", value as BroadcastAudience["hasSubscription"])}
                    options={[
                      { value: "any", label: "Any customer" },
                      { value: "yes", label: "Has a subscription" },
                      { value: "no", label: "Does not have a subscription" },
                    ]}
                  />
                  <ChoiceGroup
                    label="Subscription status"
                    selected={draft.audience.subscriptionStatuses}
                    onChange={(value) => updateAudience("subscriptionStatuses", value as BroadcastAudience["subscriptionStatuses"])}
                    choices={[
                      { value: "active", label: "Active" },
                      { value: "paused", label: "Paused" },
                      { value: "cancelled", label: "Cancelled" },
                    ]}
                  />
                  <ChoiceGroup
                    label="Frequency"
                    selected={draft.audience.subscriptionFrequencies}
                    onChange={(value) => updateAudience("subscriptionFrequencies", value as BroadcastAudience["subscriptionFrequencies"])}
                    choices={[
                      { value: "weekly", label: "Weekly" },
                      { value: "every_two_weeks", label: "Every two weeks" },
                      { value: "monthly", label: "Monthly" },
                    ]}
                  />
                  <ChoiceGroup
                    label="Delivery day"
                    selected={draft.audience.deliveryDays.map(String)}
                    onChange={(value) => updateAudience("deliveryDays", value.map(Number))}
                    choices={[
                      { value: "0", label: "Sunday" },
                      { value: "3", label: "Wednesday" },
                    ]}
                  />
                </div>
              </details>

              {filterCount > 0 && (
                <button type="button" className={styles.clearFilters} onClick={() => setDraft((current) => ({ ...current, audience: { ...EMPTY_AUDIENCE } }))}>
                  Clear all audience filters
                </button>
              )}
            </section>
          </div>
          <AudiencePreviewPanel preview={preview} loading={previewLoading} messageType={draft.messageType} filterCount={filterCount} />
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={closeComposer}>Cancel</Button>
          <Button
            onClick={saveDraft}
            isLoading={saving}
            disabled={!draft.title.trim() || !draft.description.trim() || previewLoading}
          >
            {editTarget ? "Save changes" : "Save broadcast"}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={!!sendTarget}
        onClose={() => { setSendTarget(null); setPreview(null); }}
        title="Review audience before sending"
        size="md"
      >
        {sendTarget && (
          <div className={styles.sendReview}>
            <span className={styles.sendIcon}><Send size={22} /></span>
            <div>
              <h3>{sendTarget.title}</h3>
              <p>This sends immediately and cannot be recalled.</p>
            </div>
            <AudiencePreviewPanel
              preview={preview}
              loading={previewLoading}
              messageType={sendTarget.messageType || "operational"}
              filterCount={selectedFilterCount({ ...EMPTY_AUDIENCE, ...(sendTarget.audience || {}) })}
            />
          </div>
        )}
        <ModalFooter>
          <Button variant="outline" onClick={() => { setSendTarget(null); setPreview(null); }}>Cancel</Button>
          <Button
            onClick={confirmSend}
            isLoading={saving}
            disabled={previewLoading || !preview?.totalRecipients}
            leftIcon={<Send size={16} />}
          >
            Send to {preview?.totalRecipients ?? 0} customer{preview?.totalRecipients === 1 ? "" : "s"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};
