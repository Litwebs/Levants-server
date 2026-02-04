const { Resend } = require("resend");
const emailTemplates = require("../Templates/Templates");
const { RESEND_EMAIL_KEY } = require("../config/env");
const {
  LOGO_CONTENT_ID,
  getInlineLogoAttachment,
  getLogoCidSrc,
} = require("../Templates/logoAttachment");

const resend = new Resend(RESEND_EMAIL_KEY);

const DEFAULT_FROM = "no-reply@litwebs.co.uk";
const DEFAULT_FALLBACK_FROM = "contact@litwebs.co.uk";

function canUseFromEmail(email) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  if (!e) return false;
  return e.endsWith("@litwebs.co.uk");
}

const ensureArray = (v) => (Array.isArray(v) ? v : []);
const hasLogo = (atts) =>
  ensureArray(atts).some((a) => a && a.contentId === LOGO_CONTENT_ID);

const sendEmail = async (
  to,
  subject,
  TempName = "welcomeEmail",
  templateParams = {},
  options = null,
) => {
  const templateFunction = emailTemplates[TempName];
  if (!templateFunction)
    throw new Error(`Email template "${TempName}" not found.`);

  // ✅ inject logo src into every template call
  const paramsWithLogo = {
    ...templateParams,
    logoSrc: templateParams.logoSrc || getLogoCidSrc(),
  };

  const htmlContent = templateFunction(paramsWithLogo);

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
    const payload = { from, to, subject, html: htmlContent };

    // ✅ always include logo attachment (and merge extras if provided)
    const extra =
      options && typeof options === "object"
        ? ensureArray(options.attachments)
        : [];
    payload.attachments = hasLogo(extra)
      ? extra
      : [getInlineLogoAttachment(), ...extra];

    if (options && typeof options === "object") {
      if (options.replyTo) payload.reply_to = options.replyTo;
      if (options.cc) payload.cc = options.cc;
      if (options.bcc) payload.bcc = options.bcc;
    }

    const response = await resend.emails.send(payload);
    return { success: true, response };
  } catch (error) {
    return { success: false, error };
  }
};

module.exports = sendEmail;
