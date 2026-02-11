import { Badge } from "../../components/common";
import { MediaImage, ProductStatus } from "./types";

export const getStatusBadge = (status: ProductStatus) => {
  const variants: Record<ProductStatus, "success" | "warning" | "default"> = {
    active: "success",
    draft: "warning",
    archived: "default",
  };

  return <Badge variant={variants[status]}>{status}</Badge>;
};

export const getImageUrl = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  const url = (value as MediaImage)?.url;
  return typeof url === "string" ? url : "";
};

export const getImageUrls = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => getImageUrl(v))
    .filter((v): v is string => Boolean(v));
};
