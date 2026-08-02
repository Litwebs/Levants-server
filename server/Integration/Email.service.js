const { Resend } = require("resend");
const emailTemplates = require("../Templates/Templates");
const { RESEND_EMAIL_KEY } = require("../config/env");
const {
  LOGO_CONTENT_ID,
  getInlineLogoAttachment,
  getLogoDataUri,
} = require("../Templates/logoAttachment");
const {
  getEmailBranding,
  applyEmailBranding,
  withBusinessTemplateParams,
} = require("../services/emailBranding.service");

const resend = new Resend(RESEND_EMAIL_KEY);

const FALLBACK_LOGO_URL =
  "https://res.cloudinary.com/deonzcviy/image/upload/v1777833005/logo_znwpja.png";

const DEFAULT_FROM = "no-reply@levantsdairy.co.uk";
const DEFAULT_FALLBACK_FROM = "contact@levantsdairy.co.uk";

function canUseFromEmail(email) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  if (!e) return false;
  return e.endsWith("@levantsdairy.co.uk");
}

function ensureArray(v) {
  return Array.isArray(v) ? v : [];
}

function hasLogoAttachment(atts) {
  return ensureArray(atts).some((a) => a && a.contentId === LOGO_CONTENT_ID);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function buildFrom(options = null, branding = null) {
  let from = DEFAULT_FROM;

  if (options && typeof options === "object") {
    const requestedFromEmail = String(options.fromEmail || "").trim();
    const fromName =
      String(branding?.companyName || "").trim() ||
      String(options.fromName || "").trim();
    const fallbackFrom = String(
      options.fallbackFrom || DEFAULT_FALLBACK_FROM,
    ).trim();

    const chosenFromEmail = canUseFromEmail(requestedFromEmail)
      ? requestedFromEmail
      : fallbackFrom || DEFAULT_FROM;

    from = fromName ? `${fromName} <${chosenFromEmail}>` : chosenFromEmail;
  }

  if (!options && branding?.companyName) {
    return `${branding.companyName} <${from}>`;
  }

  return from;
}

function resolveLogoSrc(templateParams = {}, branding = null) {
  let resolvedLogoSrc = String(branding?.logoSrc || "").trim();

  if (!resolvedLogoSrc) {
    resolvedLogoSrc = String(templateParams.logoSrc || "").trim();
  }

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

  if (!resolvedLogoSrc) {
    resolvedLogoSrc = FALLBACK_LOGO_URL;
  }

  return resolvedLogoSrc;
}

function buildAttachments(options = null, resolvedLogoSrc = "") {
  const extra =
    options && typeof options === "object"
      ? ensureArray(options.attachments)
      : [];

  const needsCidLogo = /^cid:/i.test(resolvedLogoSrc);
  if (!needsCidLogo) return extra;

  if (hasLogoAttachment(extra)) return extra;
  return [getInlineLogoAttachment(), ...extra];
}

function renderEmailTemplate(
  TempName = "welcomeEmail",
  templateParams = {},
  options = null,
  branding = null,
) {
  const templateFunction = emailTemplates[TempName];
  if (!templateFunction) {
    throw new Error(`Email template "${TempName}" not found.`);
  }

  const resolvedLogoSrc = resolveLogoSrc(templateParams, branding);

  const resolvedBranding = branding || {
    companyName: "Levants Dairy",
    email: "levantsdairy1@gmail.com",
    phone: "",
    address: "",
  };
  const html = applyEmailBranding(
    templateFunction(
      withBusinessTemplateParams(
        templateParams,
        resolvedBranding,
        resolvedLogoSrc,
      ),
    ),
    resolvedBranding,
    resolvedLogoSrc,
  );

  const attachments = buildAttachments(options, resolvedLogoSrc);

  return {
    html,
    attachments,
    resolvedLogoSrc,
  };
}

function buildBasePayload({
  to,
  subject,
  html,
  attachments,
  options = null,
  branding = null,
}) {
  const payload = {
    from: buildFrom(options, branding),
    to,
    subject,
    html,
  };

  if (attachments && attachments.length > 0) {
    payload.attachments = attachments;
  }

  if (options && typeof options === "object") {
    if (options.replyTo) payload.reply_to = options.replyTo;
    if (options.cc) payload.cc = options.cc;
    if (options.bcc) payload.bcc = options.bcc;
  }

  if (!payload.reply_to && branding?.email) {
    payload.reply_to = branding.email;
  }

  return payload;
}

async function sendEmail(
  to,
  subject,
  TempName = "welcomeEmail",
  templateParams = {},
  options = null,
) {
  try {
    const branding = await getEmailBranding();
    const { html, attachments } = renderEmailTemplate(
      TempName,
      templateParams,
      options,
      branding,
    );

    const payload = buildBasePayload({
      to,
      subject,
      html,
      attachments,
      options,
      branding,
    });

    if (process.env.E2E_CAPTURE_EMAILS === "1") {
      global.__E2E_EMAIL_OUTBOX__ = global.__E2E_EMAIL_OUTBOX__ || [];
      global.__E2E_EMAIL_OUTBOX__.push({
        ...payload,
        template: TempName,
        templateParams,
        capturedAt: new Date().toISOString(),
      });
      return { success: true, response: { id: `e2e-email-${global.__E2E_EMAIL_OUTBOX__.length}` } };
    }

    const response = await resend.emails.send(payload);
    return { success: true, response };
  } catch (error) {
    return { success: false, error };
  }
}

function getErrorStatus(error) {
  const status = error?.statusCode ?? error?.status ?? error?.code ?? null;
  const n = Number(status);
  return Number.isFinite(n) ? n : null;
}

function getErrorMessage(error) {
  if (!error) return "Email send failed";
  if (typeof error === "string") return error;
  return String(error.message || error.name || "Email send failed");
}

function shouldRetryStatus(status) {
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500 && status <= 599) return true;
  return false;
}

async function sendBatchEmails(
  jobs = [],
  { chunkSize = 100, maxAttempts = 3, baseDelayMs = 750 } = {},
) {
  const branding = await getEmailBranding();
  const chunks = chunkArray(jobs, chunkSize);
  const allResults = [];

  for (const group of chunks) {
    let attempt = 0;
    let sent = false;
    let lastError = null;

    while (attempt < maxAttempts && !sent) {
      attempt += 1;

      try {
        const payload = group.map((job) => {
          const { html, attachments } = renderEmailTemplate(
            job.template,
            job.templateParams,
            job.options,
            branding,
          );

          const item = buildBasePayload({
            to: job.to,
            subject: job.subject,
            html,
            attachments,
            options: job.options,
            branding,
          });

          if (job.tags) item.tags = job.tags;
          if (job.headers) item.headers = job.headers;

          return item;
        });

        // Depending on SDK version this is commonly resend.batch.send(...)
        const response = await resend.batch.send(payload);

        if (response?.error) {
          throw response.error;
        }

        const data = Array.isArray(response?.data) ? response.data : [];

        for (let i = 0; i < group.length; i += 1) {
          allResults.push({
            success: true,
            orderDbId: group[i].orderDbId,
            orderId: group[i].orderId,
            to: group[i].to,
            providerId: data[i]?.id || null,
            error: null,
          });
        }

        sent = true;
      } catch (error) {
        lastError = error;
        const status = getErrorStatus(error);

        if (!shouldRetryStatus(status) || attempt >= maxAttempts) {
          for (const job of group) {
            allResults.push({
              success: false,
              orderDbId: job.orderDbId,
              orderId: job.orderId,
              to: job.to,
              providerId: null,
              error: {
                status,
                message: getErrorMessage(error),
              },
            });
          }
          break;
        }

        const jitter = Math.floor(Math.random() * 250);
        await sleep(baseDelayMs * Math.pow(2, attempt - 1) + jitter);
      }
    }

    if (!sent && lastError && allResults.length === 0) {
      // no-op; defensive
    }
  }

  return {
    success: true,
    results: allResults,
  };
}

module.exports = sendEmail;
module.exports.sendEmail = sendEmail;
module.exports.sendBatchEmails = sendBatchEmails;
module.exports.renderEmailTemplate = renderEmailTemplate;
module.exports.getEmailErrorStatus = getErrorStatus;
module.exports.getEmailErrorMessage = getErrorMessage;
module.exports.shouldRetryEmailStatus = shouldRetryStatus;
