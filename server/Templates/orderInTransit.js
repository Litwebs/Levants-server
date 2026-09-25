module.exports = ({ name = "there", orderId, logoSrc = "./assets/logo.png" }) => {
  const escapeHtml = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const safeName = escapeHtml(name);
  const safeOrderId = escapeHtml(orderId);
  const safeLogoSrc = escapeHtml(logoSrc);

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Order In Transit</title>
</head>
<body style="margin:0;padding:0;background:#fdfaf6;font-family:Arial,sans-serif;">
<div style="display:none;font-size:1px;color:#fdfaf6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
Your Levants order ${safeOrderId} is in transit.
</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fdfaf6;padding:20px 10px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#244233;padding:24px;text-align:left;">
<img src="${safeLogoSrc}" alt="Levants" width="60" style="display:block;margin-bottom:12px;max-width:100%;height:auto;" />
<div style="font-size:13px;color:#e8e4dd;">Order In Transit</div>
</td></tr>
<tr><td style="height:4px;background:#d4a017;"></td></tr>
<tr><td style="padding:24px 20px;">
<h2 style="margin:0 0 14px 0;font-size:20px;color:#2b2b2b;">Hi ${safeName},</h2>
<p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#444;">
Your order <strong>${safeOrderId || "—"}</strong> is now in transit and on its way to you.
</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#7a746c;">Thank you for shopping with Levants.</p>
</td></tr>
<tr><td style="padding:16px 20px;background:#ffffff;border-top:1px solid #ece6dc;"></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
};
