"use strict";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

module.exports = ({
  customerName = "Customer",
  title = "Subscription update",
  message = "Your subscription has been updated.",
  subscriptionNumber = "",
  portalUrl = "",
  logoSrc = "",
}) => `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#fdfaf6;font-family:Arial,sans-serif;color:#2b2b2b">
  <div style="display:none;font-size:1px;color:#fdfaf6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">
    ${escapeHtml(message)}
  </div>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#fdfaf6;padding:20px 10px">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
          <tr>
            <td style="background:#244233;padding:24px;text-align:left">
              ${
                logoSrc
                  ? `<img src="${escapeHtml(logoSrc)}" alt="Levants" width="60" style="display:block;border:0;outline:none;text-decoration:none;margin:0 0 12px;max-width:100%;height:auto">`
                  : ""
              }
              <div style="font-size:13px;color:#e8e4dd">${escapeHtml(title)}</div>
            </td>
          </tr>
          <tr><td style="height:4px;background:#d4a017;font-size:0;line-height:0">&nbsp;</td></tr>
          <tr>
            <td style="padding:28px 24px">
              <h2 style="margin:0 0 14px;font-size:20px;line-height:1.35;color:#2b2b2b">Hello ${escapeHtml(customerName)},</h2>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#444">${escapeHtml(message)}</p>
              ${
                subscriptionNumber
                  ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 0 24px"><tr><td style="font-size:13px;color:#7a746c">Subscription:</td><td align="right" style="font-size:13px;color:#2b2b2b;font-weight:600">${escapeHtml(subscriptionNumber)}</td></tr></table>`
                  : ""
              }
              ${
                portalUrl
                  ? `<table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td style="background:#244233;border-radius:6px"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:12px 20px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700">View subscription</a></td></tr></table>`
                  : ""
              }
            </td>
          </tr>
          <tr>
            <td style="background:#f6f2ec;padding:20px;text-align:center">
              <div style="font-size:13px;line-height:1.6;color:#5e5952">If you have any questions, contact us at <a href="mailto:levantsdairy1@gmail.com" style="color:#244233;text-decoration:none;font-weight:600">levantsdairy1@gmail.com</a></div>
              <div style="margin-top:8px;font-size:12px;color:#9c968d">You can manage subscription email preferences in your customer portal.</div>
              <div style="margin-top:8px;font-size:12px;color:#9c968d">© 2026 Levants. All rights reserved.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
