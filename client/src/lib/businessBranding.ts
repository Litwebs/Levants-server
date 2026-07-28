export const BUSINESS_INFO_UPDATED_EVENT = "business-info-updated";

type BusinessInfoLike = {
  companyName?: string;
  logo?: string | { url?: string } | null;
};

export const getBusinessBranding = (business?: BusinessInfoLike | null) => ({
  companyName: business?.companyName?.trim() || "Levants Dairy",
  logoUrl:
    typeof business?.logo === "string"
      ? business.logo
      : business?.logo?.url || "",
});

export const getBusinessInitials = (companyName: string) =>
  companyName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase() || "LD";
