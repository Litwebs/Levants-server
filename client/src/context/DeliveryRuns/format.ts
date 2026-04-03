import type { ManifestItem } from "./types";

export const formatProductNameWithSku = (
  name?: string | null,
  sku?: string | null,
): string => {
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanSku = typeof sku === "string" ? sku.trim() : "";

  if (cleanName && cleanSku) return `${cleanSku} (${cleanName})`;
  return cleanName || cleanSku || "—";
};

export const formatManifestItemLabel = (item: Partial<ManifestItem>): string => {
  return formatProductNameWithSku(item?.name, item?.skuId);
};
