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
];

const MANIFEST_ITEM_RANK = new Map(
  MANIFEST_ITEM_ORDER.map((value, index) => [value, index]),
);

function normalizeManifestOrderValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getManifestItemRank(item) {
  const candidates = [item?.sku, item?.skuId, item?.name];

  for (const candidate of candidates) {
    const normalized = normalizeManifestOrderValue(candidate);
    if (MANIFEST_ITEM_RANK.has(normalized)) {
      return MANIFEST_ITEM_RANK.get(normalized);
    }
  }

  return Number.MAX_SAFE_INTEGER;
}

function compareManifestItems(a, b) {
  const rankDiff = getManifestItemRank(a) - getManifestItemRank(b);
  if (rankDiff !== 0) return rankDiff;

  const skuA = normalizeManifestOrderValue(a?.sku || a?.skuId);
  const skuB = normalizeManifestOrderValue(b?.sku || b?.skuId);
  if (skuA !== skuB) return skuA.localeCompare(skuB);

  const nameA = normalizeManifestOrderValue(a?.name);
  const nameB = normalizeManifestOrderValue(b?.name);
  return nameA.localeCompare(nameB);
}

module.exports = {
  MANIFEST_ITEM_ORDER,
  compareManifestItems,
};
