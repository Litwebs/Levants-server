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
import {
  Badge,
  Button,
  DataTableCard,
  Input,
  Select,
} from "@/components/common";
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

const PAGE_SIZE_OPTIONS = [10, 20, 50].map((size) => ({
  value: String(size),
  label: `${size} / page`,
}));

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
    category,
    setCategory,
    stock,
    setStock,
    sort,
    setSort,
    categories,
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

      <div className={styles.productWorkspace}>
      <div
        className={`${styles.contents} ${!items.length ? styles.contentsEmptyState : ""} ${error ? styles.contentsError : ""}`}
        ref={selectedRef}
      >
        <div className={styles.basketHeader}>
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
            <div className={styles.basketMetrics}>
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
            </div>
          )}
          {items.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={styles.basketToggle}
              onClick={() => setContentsOpen((open) => !open)}
              aria-expanded={contentsOpen}
              aria-label={contentsOpen ? "Collapse package basket" : "Expand package basket"}
            >
              {contentsOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </Button>
          )}
        </div>
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
                  <Input
                    className={styles.stepperInput}
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
          <div className={styles.catalogueFilters} aria-label="Catalogue filters">
            <Select
              aria-label="Filter by category"
              value={category}
              options={[
                { value: "", label: "All categories" },
                ...categories.map((value) => ({ value, label: value })),
              ]}
              onChange={setCategory}
            />
            <Select
              aria-label="Filter by stock"
              value={stock}
              options={[
                { value: "all", label: "All stock" },
                { value: "in_stock", label: "In stock" },
                { value: "low_stock", label: "Low stock (1–5)" },
                { value: "out_of_stock", label: "Out of stock" },
              ]}
              onChange={setStock}
            />
            <Select
              aria-label="Sort catalogue"
              value={sort}
              options={[
                { value: "newest", label: "Newest" },
                { value: "name_asc", label: "Variant name A–Z" },
                { value: "price_asc", label: "Price: low to high" },
                { value: "price_desc", label: "Price: high to low" },
                { value: "stock_desc", label: "Most stock" },
              ]}
              onChange={setSort}
            />
          </div>
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
                  : stock === "in_stock"
                    ? "No products are in stock"
                    : "Your catalogue is empty"}
              </strong>
              <small>
                {hasQuery
                  ? "Try a broader product name, category or SKU."
                  : stock === "in_stock"
                    ? "Switch to all products to browse unavailable variants."
                    : "Create a product variant before building a package."}
              </small>
            </div>
          )}
          {!searchError && pagination.total > 0 && (
            <DataTableCard
              className={styles.catalogueTableCard}
              tableAreaClassName={styles.catalogueTableArea}
              tableWrapperClassName={styles.catalogueTableWrap}
              loading={loading}
              loadingText="Loading variants…"
              pagination={{
                page,
                pageSize,
                total: pagination.total,
                totalPages: pagination.totalPages,
                setPage,
                setPageSize,
                pageSizeOptions: PAGE_SIZE_OPTIONS,
                loading,
              }}
            >
              <table className={styles.catalogueTable}>
                <thead>
                  <tr>
                    <th scope="col">Product &amp; variant</th>
                    <th scope="col">Category</th>
                    <th scope="col">SKU</th>
                    <th scope="col">Price</th>
                    <th scope="col">Available</th>
                    <th scope="col" className={styles.actionColumn}>Add</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((variant) => {
                    const selected = items.some(
                      (item) => item.variantId === variant._id,
                    );
                    const out = (variant.availableQuantity ?? 1) < 1;
                    const productName = variant.product?.name || "Product";
                    return (
                      <tr
                        className={selected ? styles.catalogueRowSelected : ""}
                        key={variant._id}
                      >
                        <td>
                          <div className={styles.tableProduct}>
                            <Thumb
                              src={variantImageUrl(variant)}
                              name={productName}
                            />
                            <span>
                              <strong>{productName}</strong>
                              <small>{variant.name}</small>
                            </span>
                          </div>
                        </td>
                        <td>{variant.product?.category || "Uncategorised"}</td>
                        <td className={styles.tableSku}>{variant.sku || "—"}</td>
                        <td className={styles.tablePrice}>
                          {formatPence(
                            Math.round(Number(variant.price || 0) * 100),
                          )}
                        </td>
                        <td>
                          <span
                            className={out ? styles.stockTextOut : styles.stockText}
                          >
                            {out
                              ? "Out of stock"
                              : `${variant.availableQuantity ?? "—"} in stock`}
                          </span>
                        </td>
                        <td className={styles.actionColumn}>
                          <Button
                            type="button"
                            size="sm"
                            variant={selected ? "ghost" : "outline"}
                            disabled={out || (!selected && items.length >= 30)}
                            aria-label={
                              selected
                                ? `View selected ${variant.name}`
                                : `Add variant ${variant.name}`
                            }
                            leftIcon={selected ? <Check /> : <Plus />}
                            onClick={() => add(variant)}
                          >
                            {selected ? "Selected" : "Add"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DataTableCard>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
