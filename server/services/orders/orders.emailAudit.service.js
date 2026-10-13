const { createEmailTransport } = require("../../Integration/emailTransport");
const { getLogoDataUri, LOGO_CONTENT_ID } = require("../../Templates/logoAttachment");

async function refreshEmailAudit(emails, transport = createEmailTransport()) {
  let requested = false;
  for (const email of emails) {
    if (email.providerId && typeof transport.emails.get === "function") {
      // Resend shares its request limit with sending. Avoid a burst on orders
      // with several notifications.
      if (requested) await new Promise((resolve) => setTimeout(resolve, 600));
      requested = true;
      try {
        const { data, error } = await transport.emails.get(email.providerId);
        if (error || !data) throw new Error("Resend email retrieval failed");
        email.providerStatus = data.last_event || "unknown";
        email.provider = {
          id: data.id,
          from: data.from,
          to: data.to,
          subject: data.subject,
          createdAt: data.created_at,
          lastEvent: data.last_event || "unknown",
          html: data.html || email.provider?.html || null,
          text: data.text,
        };
      } catch {
        email.providerStatus = "unavailable";
        if (email.provider) email.provider.lastEvent = "unavailable";
        email.providerError = "Live delivery status could not be loaded from Resend. Refresh to try again.";
      }
    } else {
      email.providerStatus = "unavailable";
      if (email.provider) email.provider.lastEvent = "unavailable";
      email.providerError = "No Resend delivery status is available for this email.";
    }
    if (email.provider?.html?.includes(`cid:${LOGO_CONTENT_ID}`)) {
      email.provider.html = email.provider.html.replaceAll(`cid:${LOGO_CONTENT_ID}`, getLogoDataUri());
    }
  }
  return emails;
}

module.exports = { refreshEmailAudit };
