// const { Resend } = require("resend");
// const emailTemplates = require("../Templates/Templates");
// const { RESEND_EMAIL_KEY } = require("../config/env");
// const {
//   LOGO_CONTENT_ID,
//   getInlineLogoAttachment,
//   getLogoCidSrc,
//   getLogoDataUri,
// } = require("../Templates/logoAttachment");

// const resend = new Resend(RESEND_EMAIL_KEY);

// const FALLBACK_LOGO_URL =
//   "https://res.cloudinary.com/dkrzhzr4t/image/upload/v1771166319/litwebs/variants/thumbnails/76bfa026-a03c-476c-b481-a07faf8f09de_ofh3ki.png";

// const DEFAULT_FROM = "no-reply@litwebs.co.uk";
// const DEFAULT_FALLBACK_FROM = "contact@litwebs.co.uk";

// function canUseFromEmail(email) {
//   const e = String(email || "")
//     .trim()
//     .toLowerCase();
//   if (!e) return false;
//   return e.endsWith("@litwebs.co.uk");
// }

// const ensureArray = (v) => (Array.isArray(v) ? v : []);

// const hasLogoAttachment = (atts) =>
//   ensureArray(atts).some((a) => a && a.contentId === LOGO_CONTENT_ID);

// const sendEmail = async (
//   to,
//   subject,
//   TempName = "welcomeEmail",
//   templateParams = {},
//   options = null,
// ) => {
//   const templateFunction = emailTemplates[TempName];
//   if (!templateFunction)
//     throw new Error(`Email template "${TempName}" not found.`);

//   let htmlContent = "";
//   let resolvedLogoSrc = "";

//   let from = DEFAULT_FROM;

//   if (options && typeof options === "object") {
//     const requestedFromEmail = String(options.fromEmail || "").trim();
//     const fromName = String(options.fromName || "").trim();
//     const fallbackFrom = String(
//       options.fallbackFrom || DEFAULT_FALLBACK_FROM,
//     ).trim();

//     const chosenFromEmail = canUseFromEmail(requestedFromEmail)
//       ? requestedFromEmail
//       : fallbackFrom || DEFAULT_FROM;

//     from = fromName ? `${fromName} <${chosenFromEmail}>` : chosenFromEmail;
//   }

//   try {
//     resolvedLogoSrc = String(templateParams.logoSrc || "").trim();

//     if (!resolvedLogoSrc) {
//       const envLogoUrl = String(process.env.EMAIL_LOGO_URL || "").trim();
//       if (envLogoUrl) {
//         resolvedLogoSrc = envLogoUrl;
//       } else if (
//         String(process.env.EMAIL_LOGO_MODE || "").toLowerCase() === "data-uri"
//       ) {
//         resolvedLogoSrc = getLogoDataUri();
//       }
//     }

//     if (!resolvedLogoSrc) resolvedLogoSrc = FALLBACK_LOGO_URL;

//     htmlContent = templateFunction(
//       resolvedLogoSrc
//         ? { ...templateParams, logoSrc: resolvedLogoSrc }
//         : { ...templateParams },
//     );

//     const payload = { from, to, subject, html: htmlContent };

//     // Attachments are optional; however, if the logo is referenced via CID,
//     // we must include it.
//     const extra =
//       options && typeof options === "object"
//         ? ensureArray(options.attachments)
//         : [];
//     const needsCidLogo = /^cid:/i.test(resolvedLogoSrc);
//     const mergedAttachments = needsCidLogo
//       ? hasLogoAttachment(extra)
//         ? extra
//         : [getInlineLogoAttachment(), ...extra]
//       : extra;
//     if (mergedAttachments.length > 0) payload.attachments = mergedAttachments;

//     if (options && typeof options === "object") {
//       if (options.replyTo) payload.reply_to = options.replyTo;
//       if (options.cc) payload.cc = options.cc;
//       if (options.bcc) payload.bcc = options.bcc;
//     }

//     const response = await resend.emails.send(payload);
//     return { success: true, response };
//   } catch (error) {
//     return { success: false, error };
//   }
// };

// module.exports = sendEmail;
