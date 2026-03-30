module.exports = ({
  name = "there",
  orderId,
  deliveryDate,
  etaWindowStart,
  etaWindowEnd,
  logoSrc = "./assets/logo.png",
}) => {
  const escapeHtml = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const safeName = escapeHtml(name);
  const safeOrderId = escapeHtml(orderId);
  const safeDeliveryDate = escapeHtml(deliveryDate);

  const hasWindow = Boolean(etaWindowStart && etaWindowEnd);
  const safeStart = escapeHtml(etaWindowStart);
  const safeEnd = escapeHtml(etaWindowEnd);

  const deliveryDateBlock = safeDeliveryDate
    ? `
<p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#444;">
Delivery date: <strong>${safeDeliveryDate}</strong>
</p>
`
    : "";

  const windowBlock = hasWindow
    ? `
<div style="border:1px solid #ece6dc;border-radius:8px;padding:14px 12px;margin:16px 0;background:#f6f2ec;">
<div style="font-size:13px;color:#7a746c;margin-bottom:6px;">Estimated delivery window</div>
<div style="font-size:18px;color:#2b2b2b;font-weight:700;">${safeStart} – ${safeEnd}</div>
<div style="font-size:12px;color:#7a746c;margin-top:6px;">Times are approximate.</div>
</div>
`
    : "";

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Order Dispatched</title>
</head>

<body style="margin:0;padding:0;background:#fdfaf6;font-family:Arial,sans-serif;">

<!-- Preheader -->
<div style="display:none;font-size:1px;color:#fdfaf6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
Your Levants order ${safeOrderId || ""} has been dispatched.
</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fdfaf6;padding:20px 10px;">
<tr>
<td align="center">

<!-- Main Container -->
<table width="100%" cellpadding="0" cellspacing="0" border="0"
style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">

<!-- Header -->
<tr>
<td style="background:#244233;padding:24px;text-align:left;">

<img src="${escapeHtml(logoSrc)}"
     alt="Levants"
     width="60"
     style="display:block;margin-bottom:12px;max-width:100%;height:auto;" />

<div style="font-size:13px;color:#e8e4dd;">
Order Dispatched
</div>

</td>
</tr>

<!-- Gold Divider -->
<tr>
<td style="height:4px;background:#d4a017;"></td>
</tr>

<!-- Body -->
<tr>
<td style="padding:24px 20px;">

<h2 style="margin:0 0 14px 0;font-size:20px;color:#2b2b2b;">
Hi ${safeName},
</h2>

<p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#444;">
Your order <strong>${safeOrderId || "—"}</strong> has been dispatched.
</p>

${deliveryDateBlock}

${windowBlock}

<p style="margin:0;font-size:13px;line-height:1.6;color:#7a746c;">
Thank you for shopping with Levants.
</p>

</td>
</tr>

<!-- Footer -->
<tr>
<td style="padding:16px 20px;background:#ffffff;border-top:1px solid #ece6dc;">
</td>
</tr>

</table>
</td>
</tr>
</table>

</body>
</html>
  `;
};
