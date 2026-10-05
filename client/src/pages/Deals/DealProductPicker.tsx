import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  PackageOpen,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Badge, Button, Input, Select } from "@/components/common";
import type { VariantSearchItem } from "@/context/Discounts";
import { useDealCatalog as useVariantSearch } from "./useDealCatalog";
import {
  dealTotals,
  formatPence,
  selectedItemFromVariant,
  type SelectedDealItem,
  variantImageUrl,
} from "./dealForm";
import styles from "./CreateDealPage.module.css";

type Props = {
  items: SelectedDealItem[];
  error?: string;
  onChange: (items: SelectedDealItem[]) => void;
};

const Thumb = ({ src, name }: { src?: string; name: string }) =>
  src ? (
    <img className={styles.thumb} src={src} alt="" />
  ) : (
    <span className={styles.thumbFallback} aria-label={`${name} has no image`}>
      <ImageIcon size={16} />
    </span>
  );

export function DealProductPicker({ items, error, onChange }: Props) {
  const {
    query,
    setQuery,
    results,
    loading,
    error: searchError,
    hasQuery,
    page,
    setPage,
    pageSize,
    setPageSize,
    inStock,
    setInStock,
    pagination,
  } = useVariantSearch();
  const [contentsOpen, setContentsOpen] = useState(true);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  const totals = dealTotals(items, "0");
  const packageCapacity = items.length
    ? Math.min(
        ...items.map((item) =>
          item.availableQuantity === undefined
            ? Number.POSITIVE_INFINITY
            : Math.floor(item.availableQuantity / item.quantity),
        ),
      )
    : 0;

  useEffect(() => {
    if (items.length) setContentsOpen(true);
  }, [items.length]);

  const add = (variant: VariantSearchItem) => {
    if (items.some((item) => item.variantId === variant._id)) {
      setContentsOpen(true);
      setPulseId(variant._id);
      window.setTimeout(() => setPulseId(null), 900);
      selectedRef.current?.scrollIntoView({ block: "nearest" });
      window.requestAnimationFrame(() =>
        document.getElementById(`selected-variant-${variant._id}`)?.focus(),
      );
      return;
    }
    if ((variant.availableQuantity ?? 1) < 1 || items.length >= 30) return;
    onChange([...items, selectedItemFromVariant(variant)]);
  };

  const setQuantity = (id: string, value: number) =>
    onChange(
      items.map((item) => {
        if (item.variantId !== id) return item;
        const max = Math.min(
          999,
          item.availableQuantity && item.availableQuantity > 0
            ? item.availableQuantity
            : 999,
        );
        return {
          ...item,
          quantity: Math.min(max, Math.max(1, Math.floor(value || 1))),
        };
      }),
    );

  const firstResult = pagination.total
    ? (page - 1) * pagination.pageSize + 1
    : 0;
  const lastResult = Math.min(page * pagination.pageSize, pagination.total);

  return (
    <div className={styles.productStep} aria-invalid={Boolean(error)}>
      <div className={styles.stepIntro}>
        <div>
          <span className={styles.eyebrow}>Step 1</span>
          <h2>Build the package</h2>
          <p>
            Search your catalogue and add the exact variants customers will
            receive.
          </p>
        </div>
        <Badge variant={items.length ? "success" : "default"}>
          {items.length} selected
        </Badge>
      </div>

      <div
        className={`${styles.contents} ${!items.length ? styles.contentsEmptyState : ""} ${error ? styles.contentsError : ""}`}
        ref={selectedRef}
      >
        <Button
          type="button"
          variant="ghost"
          className={styles.contentsToggle}
          onClick={() => items.length && setContentsOpen((open) => !open)}
          aria-expanded={items.length ? contentsOpen : undefined}
        >
          <span className={styles.basketIdentity}>
            <span className={styles.basketIcon}>
              <PackageOpen size={19} />
            </span>
            <span className={styles.contentsCopy}>
              <strong>Package basket</strong>
              <small>
                {items.length
                  ? `${items.length} ${items.length === 1 ? "variant" : "variants"} selected`
                  : "Select products from the catalogue below"}
              </small>
            </span>
          </span>
          {items.length > 0 && (
            <span className={styles.basketMetrics}>
              <span>
                <small>Units</small>
                <strong>{totals.totalUnits}</strong>
              </span>
              <span>
                <small>Value</small>
                <strong>{formatPence(totals.originalValuePence)}</strong>
              </span>
              <span>
                <small>Capacity</small>
                <strong>
                  {Number.isFinite(packageCapacity) ? packageCapacity : "—"}
                </strong>
              </span>
            </span>
          )}
          {items.length > 0 &&
            (contentsOpen ? (
              <ChevronUp size={18} />
            ) : (
              <ChevronDown size={18} />
            ))}
        </Button>
        {error && (
          <div className={styles.fieldError} role="alert">
            {error}
          </div>
        )}
        {items.length > 0 && contentsOpen && (
          <div className={styles.contentsBody}>
            {items.map((item) => (
              <div
                id={`selected-variant-${item.variantId}`}
                className={`${styles.selectedRow} ${pulseId === item.variantId ? styles.pulse : ""}`}
                key={item.variantId}
                tabIndex={-1}
              >
                <div className={styles.variantCell}>
                  <Thumb src={item.imageUrl} name={item.productName} />
                  <div>
                    <strong>{item.productName}</strong>
                    <span>
                      {item.variantName} · {item.sku || "No SKU"}
                    </span>
                  </div>
                </div>
                <span className={styles.unitPrice}>
                  {formatPence(item.pricePence)} each
                </span>
                <div className={styles.stepperControl}>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Decrease quantity for ${item.variantName}`}
                    disabled={item.quantity <= 1}
                    onClick={() =>
                      setQuantity(item.variantId, item.quantity - 1)
                    }
                  >
                    −
                  </Button>
                  <input
                    type="number"
                    min="1"
                    max={Math.min(999, item.availableQuantity || 999)}
                    value={item.quantity}
                    aria-label={`Quantity for ${item.variantName} (${item.productName})`}
                    onChange={(event) =>
                      setQuantity(item.variantId, Number(event.target.value))
                    }
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Increase quantity for ${item.variantName}`}
                    disabled={
                      item.quantity >=
                      Math.min(999, item.availableQuantity || 999)
                    }
                    onClick={() =>
                      setQuantity(item.variantId, item.quantity + 1)
                    }
                  >
                    +
                  </Button>
                </div>
                <strong className={styles.lineTotal}>
                  {formatPence(item.pricePence * item.quantity)}
                </strong>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={styles.remove}
                  aria-label={`Remove ${item.productName} ${item.variantName}`}
                  onClick={() =>
                    onChange(
                      items.filter(
                        (entry) => entry.variantId !== item.variantId,
                      ),
                    )
                  }
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.searchArea}>
        <div className={styles.searchTools}>
          <Input
            id="variant-search"
            label="Search products or variants"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Product name, variant, category or SKU"
            leftIcon={<Search />}
            fullWidth
            autoFocus
          />
          <div className={styles.filterGroup} aria-label="Stock filter">
            <Button
              type="button"
              size="sm"
              variant={!inStock ? "primary" : "ghost"}
              className={!inStock ? styles.filterActive : ""}
              aria-pressed={!inStock}
              onClick={() => setInStock(false)}
            >
              All products
            </Button>
            <Button
              type="button"
              size="sm"
              variant={inStock ? "primary" : "ghost"}
              className={inStock ? styles.filterActive : ""}
              aria-pressed={inStock}
              onClick={() => setInStock(true)}
            >
              In stock
            </Button>
          </div>
        </div>
        <div className={styles.catalogueHeading}>
          <div>
            <strong>
              {hasQuery
                ? `Results for “${query.trim()}”`
                : "Browse your catalogue"}
            </strong>
            <span>
              {pagination.total}{" "}
              {pagination.total === 1 ? "variant" : "variants"} available
            </span>
          </div>
          {pagination.total > 0 && (
            <span>
              Showing {firstResult}–{lastResult} of {pagination.total}
            </span>
          )}
        </div>
        <div
          id="catalogue-grid"
          className={styles.resultViewport}
          aria-live="polite"
          aria-busy={loading}
        >
          {loading && (
            <div className={styles.loadingState}>Searching catalogue…</div>
          )}
          {!loading && searchError && (
            <div className={styles.errorState} role="alert">
              {searchError}. Please try again.
            </div>
          )}
          {!loading && !searchError && results.length === 0 && (
            <div className={styles.blankState}>
              <span>
                <PackageOpen size={20} />
              </span>
              <strong>
                {hasQuery
                  ? "No matching products"
                  : inStock
                    ? "No products are in stock"
                    : "Your catalogue is empty"}
              </strong>
              <small>
                {hasQuery
                  ? "Try a broader product name, category or SKU."
                  : inStock
                    ? "Switch to all products to browse unavailable variants."
                    : "Create a product variant before building a package."}
              </small>
            </div>
          )}
          {!loading && results.length > 0 && (
            <div className={styles.productGrid}>
              {results.map((variant) => {
                const selected = items.some(
                  (item) => item.variantId === variant._id,
                );
                const out = (variant.availableQuantity ?? 1) < 1;
                const productName = variant.product?.name || "Product";
                return (
                  <article
                    className={`${styles.productCard} ${selected ? styles.productCardSelected : ""}`}
                    key={variant._id}
                  >
                    <div className={styles.productImage}>
                      {variantImageUrl(variant) ? (
                        <img src={variantImageUrl(variant)} alt={productName} />
                      ) : (
                        <span aria-label={`${productName} has no image`}>
                          <ImageIcon size={24} />
                        </span>
                      )}
                      <span
                        className={out ? styles.stockPillOut : styles.stockPill}
                      >
                        {out
                          ? "Out of stock"
                          : `${variant.availableQuantity ?? "—"} in stock`}
                      </span>
                      {selected && (
                        <span className={styles.selectedPill}>
                          <Check size={13} /> Selected
                        </span>
                      )}
                    </div>
                    <div className={styles.productCardBody}>
                      <span className={styles.productCategory}>
                        {variant.product?.category || "Uncategorised"}
                      </span>
                      <h3>{productName}</h3>
                      <p>{variant.name}</p>
                      <div className={styles.productMeta}>
                        <span>SKU {variant.sku || "—"}</span>
                        <strong>
                          {formatPence(
                            Math.round(Number(variant.price || 0) * 100),
                          )}
                        </strong>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={
                        selected ? styles.cardButtonSelected : styles.cardButton
                      }
                      disabled={out || (!selected && items.length >= 30)}
                      aria-label={
                        selected
                          ? `View selected ${variant.name}`
                          : `Add variant ${variant.name}`
                      }
                      leftIcon={selected ? <Check /> : <Plus />}
                      onClick={() => add(variant)}
                    >
                      {selected ? "Added to package" : "Add to package"}
                    </Button>
                  </article>
                );
              })}
            </div>
          )}
        </div>
        {!searchError && pagination.total > 0 && (
          <div className={styles.cataloguePagination}>
            <Select
              aria-label="Products per page"
              value={String(pageSize)}
              options={[8, 16, 24].map((size) => ({
                value: String(size),
                label: `${size} per page`,
              }))}
              onChange={(value) => {
                setPageSize(Number(value));
                setPage(1);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span>
              Page {page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page >= pagination.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
