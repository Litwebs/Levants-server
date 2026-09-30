import { type ChangeEvent, type CSSProperties, type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Info, PoundSterling, Sparkles, Store, Upload, X } from "lucide-react";
import { Badge, Button, Input } from "@/components/common";
import { useToast } from "@/components/common/Toast";
import { Switch } from "@/components/ui/switch";
import { createDeal, type DealDraft } from "@/context/Deals";
import { DealProductPicker } from "./DealProductPicker";
import { navigateWithDealTransition } from "./dealNavigation";
import { createEmptyDealDraft, dealTotals, formatPence, isValidDealSlug, slugifyDealName, type DealFormDraft, type SelectedDealItem } from "./dealForm";
import styles from "./CreateDealPage.module.css";

type FieldErrors = Partial<Record<"name" | "slug" | "packagePrice" | "endsAt" | "items" | "image", string>>;
const steps = ["Contents", "Details", "Pricing", "Publish"];

const apiError = (error: unknown) => {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { message?: unknown } } }).response;
    if (typeof response?.data?.message === "string") return response.data.message;
  }
  return error instanceof Error ? error.message : "Review the package and try again.";
};

export function CreateDealPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<DealFormDraft>(createEmptyDealDraft);
  const [items, setItems] = useState<SelectedDealItem[]>([]);
  const [slugEdited, setSlugEdited] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const totals = useMemo(() => dealTotals(items, draft.packagePrice), [items, draft.packagePrice]);
  const dirty = Boolean(draft.name || draft.description || draft.packagePrice || draft.image || items.length || draft.startsAt || draft.endsAt || draft.isFeatured || !draft.isActive);

  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty || saving) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, saving]);

  const update = <K extends keyof DealFormDraft>(key: K, value: DealFormDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };
  const updateName = (name: string) => {
    setDraft((current) => ({ ...current, name, slug: slugEdited ? current.slug : slugifyDealName(name) }));
    setErrors((current) => ({ ...current, name: undefined, slug: undefined }));
  };
  const readImage = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setErrors((current) => ({ ...current, image: "Choose a valid image file." }));
    const reader = new FileReader();
    reader.onloadend = () => update("image", String(reader.result || ""));
    reader.onerror = () => setErrors((current) => ({ ...current, image: "The image could not be read." }));
    reader.readAsDataURL(file);
  };
  const leave = () => {
    if (dirty && !window.confirm("Discard your unsaved product package?")) return;
    navigateWithDealTransition(navigate, "/deals", "back");
  };

  const validate = (onlyStep?: number) => {
    const next: FieldErrors = {};
    if ((!onlyStep || onlyStep === 1) && !items.length) next.items = "Add at least one product variant to continue.";
    if (!onlyStep || onlyStep === 2) {
      if (draft.name.trim().length < 2) next.name = "Enter a deal name of at least 2 characters.";
      if (!draft.slug || !isValidDealSlug(draft.slug)) next.slug = "Use lowercase letters, numbers and single hyphens only.";
    }
    if (!onlyStep || onlyStep === 3) {
      const price = Number(draft.packagePrice);
      if (!draft.packagePrice || !Number.isFinite(price) || price <= 0) next.packagePrice = "Enter a package price greater than £0.00.";
      else if (totals.packagePricePence >= totals.originalValuePence) next.packagePrice = "Package price must be below the combined value.";
    }
    if ((!onlyStep || onlyStep === 4) && draft.startsAt && draft.endsAt && new Date(draft.endsAt) <= new Date(draft.startsAt)) next.endsAt = "End date must be after the start date.";
    setErrors(next);
    if (Object.keys(next).length) {
      showToast({ type: "error", title: "Check the highlighted fields" });
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return false;
    }
    return true;
  };
  const next = () => {
    if (!validate(step)) return;
    setStep((current) => current + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const back = () => {
    if (step === 1) return leave();
    setStep((current) => current - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const applyDiscount = (percent: number) => {
    const pricePence = Math.round(
      totals.originalValuePence * ((100 - percent) / 100),
    );
    update("packagePrice", (pricePence / 100).toFixed(2));
  };
  const submit = async () => {
    if (saving || !validate()) return;
    const body: DealDraft = {
      name: draft.name.trim(), slug: draft.slug.trim(), description: draft.description.trim(),
      ...(draft.image ? { image: draft.image } : {}),
      items: items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
      packagePrice: Number(draft.packagePrice), currency: "GBP", isActive: draft.isActive, isFeatured: draft.isFeatured,
      startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
      endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
      sortOrder: Math.max(0, Math.floor(Number(draft.sortOrder || 0))),
    };
    setSaving(true);
    try {
      await createDeal(body);
      showToast({ type: "success", title: "Product package created" });
      navigate("/deals", { replace: true });
    } catch (error) {
      showToast({ type: "error", title: "Product package was not created", message: apiError(error) });
    } finally { setSaving(false); }
  };

  return <div className={styles.page}>
    <header className={styles.pageHeader}>
      <Button type="button" size="sm" variant="ghost" className={styles.backLink} leftIcon={<ArrowLeft />} onClick={leave}>Deals &amp; Product Packages</Button>
      <div className={styles.titleRow}>
        <div><h1 ref={titleRef} tabIndex={-1}>Create product package</h1><p>Bundle products into one compelling offer.</p></div>
      </div>
      <div className={styles.progressRow}>
        <nav className={styles.progress} aria-label="Creation progress">
          {steps.map((label, index) => {
            const number = index + 1;
            return <Button type="button" size="sm" variant="ghost" key={label} disabled={number > step} className={number === step ? styles.activeStep : number < step ? styles.doneStep : ""} onClick={() => number < step && setStep(number)} aria-current={number === step ? "step" : undefined}>
              <span className={styles.stepIndicator}>{number < step ? <Check size={14} /> : number}</span><strong>{label}</strong>{index < steps.length - 1 && <span className={styles.stepConnector} aria-hidden="true" />}
            </Button>;
          })}
        </nav>
        <div className={styles.headerControls}>
          <span className={styles.progressCopy}>Step {step} of 4</span>
          <div className={styles.headerActions}>
            {step > 1 && <Button type="button" size="sm" variant="outline" leftIcon={<ArrowLeft />} onClick={back} disabled={saving}>Back</Button>}
            {step < 4
              ? <Button type="button" size="sm" rightIcon={<ArrowRight />} onClick={next}>{step === 1 ? "Continue to details" : step === 2 ? "Set pricing" : "Review & publish"}</Button>
              : <Button type="button" size="sm" rightIcon={<Check />} onClick={() => void submit()} isLoading={saving}>Create product package</Button>}
          </div>
        </div>
      </div>
    </header>

    <div className={`${styles.workspace} ${step === 1 ? styles.catalogueWorkspace : ""}`}>
      {step === 1 && <DealProductPicker items={items} error={errors.items} onChange={(nextItems) => { setItems(nextItems); setErrors((current) => ({ ...current, items: undefined })); }} />}

      {step === 2 && <div className={styles.offerStep}>
        <div className={styles.offerForm}>
          <div className={styles.stepIntro}><div><span className={styles.eyebrow}>Step 2</span><h2>Shape the offer</h2><p>Give the package a clear identity and a price customers understand.</p></div></div>
          <div className={styles.formGrid}>
            <Input id="deal-name" label="Deal name *" value={draft.name} maxLength={140} onChange={(event) => updateName(event.target.value)} placeholder="Family Dairy Bundle" error={errors.name} aria-invalid={Boolean(errors.name)} fullWidth />
            <div className={styles.slugField}><label htmlFor="deal-slug">Storefront URL</label><div className={`${styles.slugInput} ${errors.slug ? styles.invalid : ""}`}><span>/deals/</span><input id="deal-slug" value={draft.slug} onChange={(event) => { setSlugEdited(true); update("slug", event.target.value.toLowerCase()); }} placeholder="family-dairy-bundle" aria-invalid={Boolean(errors.slug)} /></div><small className={errors.slug ? styles.fieldError : ""}>{errors.slug || "Generated until you edit it."}</small></div>
            <div className={styles.full}><label htmlFor="deal-description">Description</label><textarea id="deal-description" value={draft.description} onChange={(event) => update("description", event.target.value)} maxLength={3000} placeholder="What makes this package worth choosing?" /><small>{draft.description.length}/3000</small></div>
          </div>
        </div>
        <aside className={styles.offerPreview}>
          <span className={styles.previewLabel}>Storefront preview</span>
          <div className={styles.previewMedia}>
            {draft.image ? <><img src={draft.image} alt="Package preview" /><Button type="button" size="sm" variant="ghost" aria-label="Remove package image" onClick={() => { update("image", ""); if (fileRef.current) fileRef.current.value = ""; }}><X size={16} /></Button></> : <Button type="button" variant="ghost" className={styles.upload} onClick={() => fileRef.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event: DragEvent<HTMLButtonElement>) => { event.preventDefault(); setDragging(false); readImage(event.dataTransfer.files?.[0]); }} data-dragging={dragging}><span className={styles.uploadIcon}><Upload size={20} /></span><strong>Add package image</strong><small>Optional · product image used as fallback</small></Button>}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => readImage(event.target.files?.[0])} />
          </div>
          <div className={styles.previewBody}><Badge variant="success">Package deal</Badge><h3>{draft.name || "Your package name"}</h3><p>{draft.description || "A short description will appear here for customers."}</p><div><strong>{formatPence(totals.packagePricePence)}</strong>{totals.originalValuePence > 0 && <span>{formatPence(totals.originalValuePence)}</span>}</div><small>{totals.totalUnits} items across {totals.uniqueVariants} variants</small></div>
          {errors.image && <div className={styles.fieldError}>{errors.image}</div>}
        </aside>
      </div>}

      {step === 3 && <div className={styles.pricingStep}>
        <div className={styles.pricingEditor}>
          <div className={styles.stepIntro}><div><span className={styles.eyebrow}>Step 3</span><h2>Price the package</h2><p>Choose a compelling price and see the customer value update instantly.</p></div></div>
          <div className={styles.pricingInputBlock}>
            <Input id="package-price" label="Package price (£) *" type="number" min="0.01" step="0.01" value={draft.packagePrice} onChange={(event) => update("packagePrice", event.target.value)} leftIcon={<PoundSterling />} error={errors.packagePrice} aria-invalid={Boolean(errors.packagePrice)} fullWidth autoFocus />
            <div className={styles.discountPresets}>
              <span>Quick discount</span>
              <div>{[5, 10, 15, 20].map((percent) => <Button type="button" size="sm" variant="outline" key={percent} onClick={() => applyDiscount(percent)}>{percent}% off</Button>)}</div>
            </div>
          </div>
          <div className={styles.pricingGuidance}>
            <div><span>Combined retail value</span><strong>{formatPence(totals.originalValuePence)}</strong><small>Based on current variant prices and quantities</small></div>
            <div><span>Package price</span><strong>{formatPence(totals.packagePricePence)}</strong><small>{totals.totalUnits ? `${formatPence(Math.round(totals.packagePricePence / totals.totalUnits))} per item` : "—"}</small></div>
            <div className={styles.savingsMetric}><span>Customer savings</span><strong>{formatPence(totals.savingsPence)}</strong><small>{totals.discountPercent}% below retail value</small></div>
          </div>
          {totals.packagePricePence >= totals.originalValuePence && totals.packagePricePence > 0 && <div className={styles.priceWarning}><Info size={16} /> Set the package price below {formatPence(totals.originalValuePence)} to create a valid saving.</div>}
        </div>
        <aside className={styles.valuePreview}>
          <span className={styles.previewLabel}>Customer value</span>
          <div className={styles.valueRing} style={{ "--discount": `${Math.min(100, totals.discountPercent) * 3.6}deg` } as CSSProperties}><div><strong>{totals.discountPercent}%</strong><span>saving</span></div></div>
          <h3>{draft.name || "Your package"}</h3>
          <div className={styles.valuePrice}><strong>{formatPence(totals.packagePricePence)}</strong><span>{formatPence(totals.originalValuePence)}</span></div>
          <p>{totals.totalUnits} items · {totals.uniqueVariants} variants · save {formatPence(totals.savingsPence)}</p>
        </aside>
      </div>}

      {step === 4 && <div className={styles.publishStep}>
        <div className={styles.publishForm}>
          <div className={styles.stepIntro}><div><span className={styles.eyebrow}>Step 4</span><h2>Choose when and where it appears</h2><p>Review the package, set availability, then publish.</p></div></div>
          <section className={styles.group}><div className={styles.groupTitle}><CalendarDays size={19} /><div><h3>Availability</h3><p>Leave blank to make the package available without a schedule.</p></div></div><div className={styles.formGrid}><Input id="starts-at" label="Starts at" type="datetime-local" value={draft.startsAt} onChange={(event) => update("startsAt", event.target.value)} fullWidth /><Input id="ends-at" label="Ends at" type="datetime-local" min={draft.startsAt || undefined} value={draft.endsAt} onChange={(event) => update("endsAt", event.target.value)} error={errors.endsAt} aria-invalid={Boolean(errors.endsAt)} fullWidth /></div></section>
          <section className={styles.group}><div className={styles.groupTitle}><Store size={19} /><div><h3>Merchandising</h3><p>Control visibility and storefront priority.</p></div></div><div className={styles.settings}>
            <label><span><strong>Active on storefront</strong><small>Customers can find and buy this package.</small></span><Switch checked={draft.isActive} onCheckedChange={(checked) => update("isActive", checked)} aria-label="Active on storefront" /></label>
            <label><span><strong>Feature this deal</strong><small>Give it extra prominence on the storefront.</small></span><Switch checked={draft.isFeatured} onCheckedChange={(checked) => update("isFeatured", checked)} aria-label="Featured deal" /></label>
            <div><span><strong>Display order</strong><small>Lower numbers appear first.</small></span><Input id="display-order" aria-label="Display order" type="number" min="0" max="9999" value={draft.sortOrder} onChange={(event) => update("sortOrder", event.target.value)} /></div>
          </div></section>
        </div>
        <aside className={styles.review}>
          <div className={styles.reviewHeader}><span><Sparkles size={17} /> Ready to publish</span><Badge variant={draft.isActive ? "success" : "default"}>{draft.isActive ? "Active" : "Inactive"}</Badge></div>
          <h3>{draft.name}</h3><p>{items.length} variants · {totals.totalUnits} total items</p>
          <div className={styles.reviewMoney}><span><small>Combined value</small>{formatPence(totals.originalValuePence)}</span><span><small>Package price</small>{formatPence(totals.packagePricePence)}</span><span className={styles.savings}><small>Customer saves</small>{formatPence(totals.savingsPence)} ({totals.discountPercent}%)</span></div>
          <div className={styles.reviewChecklist}><span><Check size={15} /> Products selected</span><span><Check size={15} /> Offer details complete</span><span><Check size={15} /> {draft.isActive ? "Visible after publishing" : "Saved as inactive"}</span></div>
          <div className={styles.reviewNote}><Info size={15} /> You can edit, deactivate or archive this package later.</div>
        </aside>
      </div>}
    </div>
  </div>;
}
