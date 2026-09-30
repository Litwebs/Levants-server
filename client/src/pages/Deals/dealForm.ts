import type { VariantSearchItem } from "@/context/Discounts";

export type DealFormDraft = {
  name: string;
  slug: string;
  description: string;
  image: string;
  packagePrice: string;
  isActive: boolean;
  isFeatured: boolean;
  startsAt: string;
  endsAt: string;
  sortOrder: string;
};

export type SelectedDealItem = {
  variantId: string;
  variantName: string;
  productName: string;
  category?: string;
  sku: string;
  pricePence: number;
  quantity: number;
  availableQuantity?: number;
  status?: string;
  imageUrl?: string;
};

export const createEmptyDealDraft = (): DealFormDraft => ({
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

export const slugifyDealName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);

export const isValidDealSlug = (value: string) =>
  !value || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

export const poundsToPence = (value: string | number) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
};

export const formatPence = (pence: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);

export const variantImageUrl = (variant: VariantSearchItem) =>
  variant.thumbnailImage?.url || variant.product?.thumbnailImage?.url || "";

export const selectedItemFromVariant = (
  variant: VariantSearchItem,
): SelectedDealItem => ({
  variantId: variant._id,
  variantName: variant.name,
  productName: variant.product?.name || "Product",
  category: variant.product?.category,
  sku: variant.sku || "",
  pricePence: poundsToPence(variant.price || 0),
  quantity: 1,
  availableQuantity: variant.availableQuantity,
  status: variant.status,
  imageUrl: variantImageUrl(variant),
});

export const dealTotals = (
  items: SelectedDealItem[],
  packagePrice: string,
) => {
  const originalValuePence = items.reduce(
    (sum, item) => sum + item.pricePence * item.quantity,
    0,
  );
  const packagePricePence = poundsToPence(packagePrice);
  const savingsPence = Math.max(0, originalValuePence - packagePricePence);
  const discountPercent = originalValuePence
    ? Math.round((savingsPence / originalValuePence) * 100)
    : 0;

  return {
    uniqueVariants: items.length,
    totalUnits: items.reduce((sum, item) => sum + item.quantity, 0),
    originalValuePence,
    packagePricePence,
    savingsPence,
    discountPercent,
  };
};
