import type { ManifestItem } from "./types";

const MANIFEST_ITEM_ORDER = [
  "2-litre-milk",
  "2-litre-semi-skimmed-milk",
  "2-litre-double-cream",
  "plastic-pint-milk",
  "glass-pint-milk",
  "semi-skimmed-glass-pint",
  "pint-double-cream",
  "c-milkshake",
  "s-milkshake",
  "b-milkshake",
  "orange",
  "clear-apple",
  "cloudy-apple",
  "pineapple",
  "apple&mango",
  "cloudy-lemonade",
  "peach-ice-tea",
  "cranberry",
  "tropical",
  "grapefruit",
  "6-eggs",
  "12-eggs",
  "30-eggs",
  "butter",
  "mc-cheese",
  "rl-cheese",
  "h-cheese",
  "honey",
  "ghee",
  "w-bread",
  "b-bread",
  "sourdough",
] as const;

const MANIFEST_ITEM_RANK = new Map(
  MANIFEST_ITEM_ORDER.map((value, index) => [value, index]),
);

const normalizeManifestOrderValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const getManifestItemRank = (item: Partial<ManifestItem>) => {
  const candidates = [item.skuId, item.name];

  for (const candidate of candidates) {
    const normalized = normalizeManifestOrderValue(candidate);
    if (MANIFEST_ITEM_RANK.has(normalized)) {
      return MANIFEST_ITEM_RANK.get(normalized) ?? Number.MAX_SAFE_INTEGER;
    }
  }

  return Number.MAX_SAFE_INTEGER;
};

export const compareManifestItems = (
  a: Partial<ManifestItem>,
  b: Partial<ManifestItem>,
) => {
  const rankDiff = getManifestItemRank(a) - getManifestItemRank(b);
  if (rankDiff !== 0) return rankDiff;

  const skuDiff = normalizeManifestOrderValue(a.skuId).localeCompare(
    normalizeManifestOrderValue(b.skuId),
  );
  if (skuDiff !== 0) return skuDiff;

  return normalizeManifestOrderValue(a.name).localeCompare(
    normalizeManifestOrderValue(b.name),
  );
};