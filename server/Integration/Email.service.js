const { Resend } = require("resend");
const emailTemplates = require("../Templates/Templates");
const { RESEND_EMAIL_KEY } = require("../config/env");
const {
  LOGO_CONTENT_ID,
  getInlineLogoAttachment,
  getLogoCidSrc,
  getLogoDataUri,
} = require("../Templates/logoAttachment");

const resend = new Resend(RESEND_EMAIL_KEY || "");

const FALLBACK_LOGO_URL =
  "https://res.cloudinary.com/dkrzhzr4t/image/upload/v1771166319/litwebs/variants/thumbnails/76bfa026-a03c-476c-b481-a07faf8f09de_ofh3ki.png";

const DEFAULT_FROM = "no-reply@levantsdairy.co.uk";
const DEFAULT_FALLBACK_FROM = "contact@levantsdairy.co.uk";

function isValidEmail(raw) {
  const email = String(raw || "").trim();
  if (!email) return false;
  if (email.length > 254) return false;

  // Basic, practical validation (avoid rejecting valid-but-rare RFC cases).
  // Ensures we don't send obviously broken addresses to the provider.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function extractEmailAddress(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";

  // Support common forms: "Name <user@example.com>"
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

function normalizeEmailRecipients(input) {
  const parts = [];

  if (Array.isArray(input)) {
    for (const v of input) parts.push(String(v || ""));
  } else if (typeof input === "string") {
    // Allow comma/semicolon separated lists.
    parts.push(...input.split(/[;,]/g));
  } else if (input != null) {
    parts.push(String(input));
  }

  const cleaned = parts
    .map((p) => extractEmailAddress(p))
    .map((p) => p.trim())
    .filter(Boolean);

  const valid = [];
  const invalid = [];
  const seen = new Set();

  for (const email of cleaned) {
    const normalized = email.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    if (isValidEmail(email)) valid.push(email);
    else invalid.push(email);
  }

  return { valid, invalid };
}

function canUseFromEmail(email) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  if (!e) return false;
  return e.endsWith("@levantsdairy.co.uk");
}

const ensureArray = (v) => (Array.isArray(v) ? v : []);

const hasLogoAttachment = (atts) =>
  ensureArray(atts).some((a) => a && a.contentId === LOGO_CONTENT_ID);

const sendEmail = async (
  to,
  subject,
  TempName = "welcomeEmail",
  templateParams = {},
  options = null,
) => {
  if (!RESEND_EMAIL_KEY) {
    const error = new Error(
      "Email sending is not configured (missing RESEND_EMAIL_KEY)",
    );
    // Log once per call to make misconfig obvious.
    console.error("[email] misconfigured: missing RESEND_EMAIL_KEY", {
      to,
      subject,
      template: TempName,
    });
    return { success: false, error };
  }

  const templateFunction = emailTemplates[TempName];
  if (!templateFunction) {
    const error = new Error(`Email template "${TempName}" not found.`);
    console.error("[email] template not found", {
      template: TempName,
      to,
      subject,
    });
    return { success: false, error };
  }

  // Compute template + payload inside the try block so logo failures never
  // prevent email sending.
  let htmlContent = "";
  let resolvedLogoSrc = "";

  let from = DEFAULT_FROM;

  if (options && typeof options === "object") {
    const requestedFromEmail = String(options.fromEmail || "").trim();
    const fromName = String(options.fromName || "").trim();
    const fallbackFrom = String(
      options.fallbackFrom || DEFAULT_FALLBACK_FROM,
    ).trim();

    const chosenFromEmail = canUseFromEmail(requestedFromEmail)
      ? requestedFromEmail
      : fallbackFrom || DEFAULT_FROM;

    from = fromName ? `${fromName} <${chosenFromEmail}>` : chosenFromEmail;
  }

  try {
    const toList = normalizeEmailRecipients(to);
    if (toList.invalid.length > 0) {
      console.warn("[email] skipping invalid recipients", {
        invalid: toList.invalid,
        template: TempName,
        subject,
      });
    }

    if (toList.valid.length === 0) {
      return {
        success: false,
        error: new Error("No valid recipient email addresses"),
      };
    }

    resolvedLogoSrc = String(templateParams.logoSrc || "").trim();

    if (!resolvedLogoSrc) {
      const envLogoUrl = String(process.env.EMAIL_LOGO_URL || "").trim();
      if (envLogoUrl) {
        resolvedLogoSrc = envLogoUrl;
      } else if (
        String(process.env.EMAIL_LOGO_MODE || "").toLowerCase() === "data-uri"
      ) {
        resolvedLogoSrc = getLogoDataUri();
      }
    }

    if (!resolvedLogoSrc) resolvedLogoSrc = FALLBACK_LOGO_URL;

    htmlContent = templateFunction(
      resolvedLogoSrc
        ? { ...templateParams, logoSrc: resolvedLogoSrc }
        : { ...templateParams },
    );

    const payload = {
      from,
      to: toList.valid.length === 1 ? toList.valid[0] : toList.valid,
      subject,
      html: htmlContent,
    };

    // Attachments are optional; however, if the logo is referenced via CID,
    // we must include it.
    const extra =
      options && typeof options === "object"
        ? ensureArray(options.attachments)
        : [];
    const needsCidLogo = /^cid:/i.test(resolvedLogoSrc);
    const mergedAttachments = needsCidLogo
      ? hasLogoAttachment(extra)
        ? extra
        : [getInlineLogoAttachment(), ...extra]
      : extra;
    if (mergedAttachments.length > 0) payload.attachments = mergedAttachments;

    if (options && typeof options === "object") {
      if (options.replyTo) payload.reply_to = options.replyTo;

      const ccList = normalizeEmailRecipients(options.cc);
      if (ccList.invalid.length > 0) {
        console.warn("[email] skipping invalid cc recipients", {
          invalid: ccList.invalid,
          template: TempName,
          subject,
        });
      }
      if (ccList.valid.length > 0) {
        payload.cc = ccList.valid.length === 1 ? ccList.valid[0] : ccList.valid;
      }

      const bccList = normalizeEmailRecipients(options.bcc);
      if (bccList.invalid.length > 0) {
        console.warn("[email] skipping invalid bcc recipients", {
          invalid: bccList.invalid,
          template: TempName,
          subject,
        });
      }
      if (bccList.valid.length > 0) {
        payload.bcc =
          bccList.valid.length === 1 ? bccList.valid[0] : bccList.valid;
      }
    }

    const response = await resend.emails.send(payload);
    return { success: true, response };
  } catch (error) {
    console.error("[email] send failed", {
      to,
      subject,
      template: TempName,
      error: error?.message || String(error),
    });
    return { success: false, error };
  }
};

module.exports = sendEmail;
