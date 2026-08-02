const BusinessInfo = require("../models/businessInfo.model");

const SINGLETON_KEY = "business-info";

const DEFAULT_BRANDING = {
  companyName: "Levants Dairy",
  email: "levantsdairy1@gmail.com",
  phone: "",
  address: "",
  logoSrc: "",
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function getEmailBranding() {
  try {
    let business = await BusinessInfo.findOne({
      singletonKey: SINGLETON_KEY,
    })
      .populate("logo")
      .lean();

    if (!business) {
      business = await BusinessInfo.findOne().populate("logo").lean();
    }

    if (!business) return DEFAULT_BRANDING;

    return {
      companyName:
        String(business.companyName || "").trim() ||
        DEFAULT_BRANDING.companyName,
      email:
        String(business.email || "").trim() || DEFAULT_BRANDING.email,
      phone: String(business.phone || "").trim(),
      address: String(business.address || "").trim(),
      logoSrc: String(business.logo?.url || "").trim(),
    };
  } catch {
    return DEFAULT_BRANDING;
  }
}

function applyEmailBranding(html, branding, logoSrc) {
  let output = String(html || "");
  const safeLogoSrc = escapeHtml(logoSrc);

  if (safeLogoSrc) {
    output = output.replace(/<img\b[^>]*>/gi, (tag) => {
      if (!/\balt\s*=\s*["'](?:Levants|Logo)["']/i.test(tag)) return tag;

      if (/\bsrc\s*=\s*["'][^"']*["']/i.test(tag)) {
        return tag.replace(
          /\bsrc\s*=\s*["'][^"']*["']/i,
          `src="${safeLogoSrc}"`,
        );
      }

      return tag.replace("<img", `<img src="${safeLogoSrc}"`);
    });
  }

  output = output.replace(
    /(?:levantsdairy1@gmail\.com|contact@levantsdairy\.co\.uk|contact@levants\.co\.uk)/gi,
    "__BUSINESS_EMAIL__",
  );
  output = output.replace(
    /\bLevants Dairy\b|\bLevants\b/gi,
    "__BUSINESS_NAME__",
  );

  return output
    .replace(/__BUSINESS_EMAIL__/g, escapeHtml(branding.email))
    .replace(/__BUSINESS_NAME__/g, escapeHtml(branding.companyName));
}

function withBusinessTemplateParams(templateParams, branding, logoSrc) {
  return {
    ...templateParams,
    logoSrc,
    companyName: branding.companyName,
    businessEmail: branding.email,
    businessPhone: branding.phone,
    businessAddress: branding.address,
  };
}

module.exports = {
  DEFAULT_BRANDING,
  getEmailBranding,
  applyEmailBranding,
  withBusinessTemplateParams,
};
