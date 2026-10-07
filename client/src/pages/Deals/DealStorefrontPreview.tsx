import { useLayoutEffect, useState, type CSSProperties } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, Check, Eye, Monitor, Moon, Package, ShoppingBag, Smartphone, Sun, Tablet, X } from "lucide-react";
import { dealTotals, formatPence, type DealFormDraft, type SelectedDealItem } from "./dealForm";
import styles from "./DealStorefrontPreview.module.css";

type Props = { draft: DealFormDraft; items: SelectedDealItem[] };
type Device = "desktop" | "tablet" | "mobile";
const deviceWidths: Record<Device, number> = { desktop: 1280, tablet: 768, mobile: 390 };

function SkeletonDeal() {
  return (
    <div className={styles.skeletonCard} aria-hidden="true">
      <div className={styles.skeletonImage} />
      <div className={styles.skeletonContent}>
        <i className={styles.short} /><i className={styles.long} /><i /><i /><i className={styles.short} /><i className={styles.buttonShape} />
      </div>
    </div>
  );
}

export function DealStorefrontPreview({ draft, items }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"listing" | "detail">("listing");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [device, setDevice] = useState<Device>("desktop");
  const [scale, setScale] = useState(1);
  const [pageHeight, setPageHeight] = useState(0);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [page, setPage] = useState<HTMLDivElement | null>(null);
  const deviceWidth = deviceWidths[device];

  useLayoutEffect(() => {
    if (!open) return;
    if (!stage || !page) return;
    const measure = () => {
      const height = page.scrollHeight;
      const stageStyle = getComputedStyle(stage);
      const availableWidth = Math.max(
        1,
        stage.clientWidth - parseFloat(stageStyle.paddingLeft) - parseFloat(stageStyle.paddingRight),
      );
      const availableHeight = Math.max(
        1,
        stage.clientHeight - parseFloat(stageStyle.paddingTop) - parseFloat(stageStyle.paddingBottom),
      );
      setPageHeight(height);
      setScale(Math.min(1, availableWidth / deviceWidth, availableHeight / height));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    observer.observe(page);
    return () => observer.disconnect();
  }, [open, deviceWidth, view, stage, page]);
  const totals = dealTotals(items, draft.packagePrice);
  const imageUrl = draft.image || items.find((item) => item.imageUrl)?.imageUrl;
  const now = Date.now();
  const inactive = !draft.isActive;
  const scheduled = Boolean(draft.startsAt && new Date(draft.startsAt).getTime() > now);
  const expired = Boolean(draft.endsAt && new Date(draft.endsAt).getTime() <= now);
  const soldOut = items.length === 0 || items.some(
    (item) => item.availableQuantity !== undefined && item.availableQuantity < item.quantity,
  );
  const unavailable = inactive || scheduled || expired || soldOut;
  const visibility = inactive ? "Inactive — customers cannot see this deal"
    : scheduled ? "Scheduled — customers will see it after the start date"
    : expired ? "Expired — customers cannot see this deal"
    : soldOut ? "Out of stock — visible, but unavailable to buy"
    : "Visible to customers once saved";
  const name = draft.name.trim() || "Your package name";
  const description = draft.description.trim();
  const image = imageUrl
    ? <img src={imageUrl} alt={name} />
    : <Package size={56} aria-hidden="true" className={styles.imageFallback} />;
  const badges = (
    <div className={styles.badges}>
      <span className={styles.savingBadge}>Save {totals.discountPercent}%</span>
      {draft.isFeatured && <span className={styles.featuredBadge}>Featured</span>}
      {unavailable && <span className={styles.unavailableBadge}>Unavailable</span>}
    </div>
  );
  const purchaseButton = (
    <button type="button" disabled className={styles.purchaseButton}>
      <ShoppingBag size={16} aria-hidden="true" />
      {unavailable ? "Currently unavailable" : "Add package to basket"}
    </button>
  );

  return (
    <div className={styles.previewControl}>
      <div><strong>Customer preview</strong><p>See this deal in the storefront before saving.</p></div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button type="button" className={styles.openButton}><Eye size={17} aria-hidden="true" /> Preview storefront</button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={styles.dialog}>
            <div className={styles.dialogHeader}>
              <div><Dialog.Title>Customer storefront preview</Dialog.Title><Dialog.Description>{visibility}</Dialog.Description></div>
              <Dialog.Close className={styles.iconButton} aria-label="Close preview"><X size={20} /></Dialog.Close>
            </div>
            <div className={styles.toolbar}>
                <div className={styles.viewTabs} role="group" aria-label="Preview page">
                  <button type="button" aria-pressed={view === "listing"} className={view === "listing" ? styles.activeTab : ""} onClick={() => setView("listing")}>Deals listing</button>
                  <button type="button" aria-pressed={view === "detail"} className={view === "detail" ? styles.activeTab : ""} onClick={() => setView("detail")}>Details page</button>
                </div>
                <div className={styles.deviceTabs} role="group" aria-label="Screen size">
                  <button type="button" aria-pressed={device === "desktop"} className={device === "desktop" ? styles.activeDevice : ""} onClick={() => setDevice("desktop")} title="Desktop · 1280 pixels"><Monitor size={16} /><span>Desktop</span></button>
                  <button type="button" aria-pressed={device === "tablet"} className={device === "tablet" ? styles.activeDevice : ""} onClick={() => setDevice("tablet")} title="Tablet · 768 pixels"><Tablet size={16} /><span>Tablet</span></button>
                  <button type="button" aria-pressed={device === "mobile"} className={device === "mobile" ? styles.activeDevice : ""} onClick={() => setDevice("mobile")} title="Mobile · 390 pixels"><Smartphone size={16} /><span>Mobile</span></button>
                </div>
                <button type="button" className={styles.iconButton} onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={`Show ${theme === "light" ? "dark" : "light"} storefront theme`}>
                  {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
                </button>
            </div>
            <div
              className={[
                styles.previewStage,
                theme === "dark" ? styles.stageDark : "",
                device === "desktop" ? styles.desktopStage : "",
                device === "desktop" && view === "listing" ? styles.listingStage : "",
              ].filter(Boolean).join(" ")}
              style={{ "--hero-height": `${160 * scale}px` } as CSSProperties}
              ref={setStage}
            >
            <div
              className={`${styles.previewFrame} ${device === "desktop" ? styles.desktopFrame : ""}`}
              style={{ width: deviceWidth * scale, height: pageHeight * scale }}
            >
            <div
              ref={setPage}
              className={`${styles.storefront} ${theme === "dark" ? styles.dark : ""}`}
              style={{ width: deviceWidth, transform: `scale(${scale})` }}
            >
              {view === "listing" ? (
                <>
                  <div className={styles.listingHero}><div className={styles.container}>
                    <h2>Deals &amp; Product Packages</h2><p>Fresh product collections at a better package price.</p>
                  </div></div>
                  <div className={`${styles.container} ${styles.listingContent}`}>
                    <div className={styles.dealsGrid}>
                      <SkeletonDeal />
                      <article className={styles.dealCard} aria-label="Your deal in the listing">
                        <div className={styles.cardImage}>{image}{badges}</div>
                        <div className={styles.cardBody}>
                          <p className={styles.kicker}>Package deal</p>
                          <h3>{name}</h3>
                          {description && <p className={styles.cardDescription}>{description}</p>}
                          <div className={styles.priceRow}><strong>{formatPence(totals.packagePricePence)}</strong><s>{formatPence(totals.originalValuePence)}</s></div>
                          {draft.endsAt && <p className={styles.smallText}>Ends {new Date(draft.endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>}
                          <p className={styles.smallText}>{items.length} product{items.length === 1 ? "" : "s"} included</p>
                        </div>
                        <div className={styles.cardFooter}>{purchaseButton}</div>
                      </article>
                      <SkeletonDeal />
                    </div>
                  </div>
                </>
              ) : (
                <div className={`${styles.container} ${styles.detailsContent}`}>
                  <div className={styles.backLink}><ArrowLeft size={16} />Back to deals</div>
                  <div className={styles.detailsGrid}>
                    <div className={styles.detailsImage}>{image}</div>
                    <div className={styles.detailsInfo}>
                      {badges}
                      <h2>{name}</h2>
                      {description && <p className={styles.detailsDescription}>{description}</p>}
                      <div className={styles.detailsPrice}><strong>{formatPence(totals.packagePricePence)}</strong><s>{formatPence(totals.originalValuePence)}</s></div>
                      <p className={styles.savings}>You save {formatPence(totals.savingsPence)}</p>
                      {draft.endsAt && <p className={styles.offerEnds}>Offer ends {new Date(draft.endsAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>}
                      <div className={styles.included}>
                        <h3>What's included</h3>
                        {items.length ? items.map((item) => (
                          <div key={item.variantId}><Check size={16} /><div><strong>{item.productName}</strong><span>{item.variantName} × {item.quantity}</span></div></div>
                        )) : <p>Select products to see them here.</p>}
                      </div>
                      {purchaseButton}
                      {!unavailable && items.length > 0 && <p className={styles.smallText}>Package availability is calculated from live stock.</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
            </div>
            </div>
            <div className={styles.dialogFooter}>Preview only · {deviceWidth}px {device} layout, scaled to fit · No changes are published until you save.</div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
