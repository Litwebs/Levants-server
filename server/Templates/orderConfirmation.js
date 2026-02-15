// Services/Templates/orderConfirmation.js
module.exports = ({
  name = "there",
  orderId,
  items = [],
  total,
  currency = "GBP",
  billingAddress,
  shippingAddress,
  orderDate,
  logoSrc = "./assets/logo.png",
}) => `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Order Confirmation</title>
</head>

<body style="margin:0;padding:0;background:#fdfaf6;font-family:Arial,sans-serif;">

<!-- Preheader -->
<div style="display:none;font-size:1px;color:#fdfaf6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
Your levants order ${orderId || ""} has been confirmed.
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

<!-- Logo -->
<img src="https://res.cloudinary.com/dkrzhzr4t/image/upload/v1771166319/litwebs/variants/thumbnails/76bfa026-a03c-476c-b481-a07faf8f09de_ofh3ki.png"
     alt="Levants"
     width="60"
     style="display:block;margin-bottom:12px;max-width:100%;height:auto;" />

<div style="font-size:13px;color:#e8e4dd;">
Order Confirmation
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
Thank you, ${name}.
</h2>

<p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#444;">
We’ve received your order and it’s now being processed.
Below are your order details.
</p>

<!-- Order Meta -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
<tr>
<td style="font-size:13px;color:#7a746c;">Order ID:</td>
<td align="right" style="font-size:13px;color:#2b2b2b;font-weight:600;">
${orderId || "—"}
</td>
</tr>
${
  orderDate
    ? `
<tr>
<td style="font-size:13px;color:#7a746c;padding-top:6px;">Date:</td>
<td align="right" style="font-size:13px;color:#2b2b2b;padding-top:6px;">
${orderDate}
</td>
</tr>
`
    : ""
}
</table>

<!-- Items -->
<table width="100%" cellpadding="0" cellspacing="0" border="0"
style="border:1px solid #ece6dc;border-radius:8px;overflow:hidden;margin-bottom:20px;">

<tr style="background:#f6f2ec;">
<td style="padding:10px;font-size:13px;font-weight:600;color:#2b2b2b;">
Item
</td>
<td align="center" style="padding:10px;font-size:13px;font-weight:600;color:#2b2b2b;">
Qty
</td>
<td align="right" style="padding:10px;font-size:13px;font-weight:600;color:#2b2b2b;">
Price
</td>
</tr>

${(items || [])
  .map(
    (item) => `
<tr>
<td style="padding:10px;font-size:13px;color:#444;">
${item.name}
</td>
<td align="center" style="padding:10px;font-size:13px;color:#444;">
${item.quantity}
</td>
<td align="right" style="padding:10px;font-size:13px;color:#444;">
${currency} ${item.subtotal}
</td>
</tr>
`,
  )
  .join("")}

</table>

<!-- Total -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
<tr>
<td style="font-size:14px;font-weight:600;color:#2b2b2b;">
Total
</td>
<td align="right" style="font-size:15px;font-weight:700;color:#244233;">
${currency} ${total}
</td>
</tr>
</table>

${
  shippingAddress
    ? `
<div style="margin-bottom:16px;">
<div style="font-size:13px;font-weight:600;color:#2b2b2b;margin-bottom:6px;">
Shipping Address
</div>
<div style="font-size:13px;color:#6a645c;line-height:1.5;">
${shippingAddress}
</div>
</div>
`
    : ""
}

${
  billingAddress
    ? `
<div>
<div style="font-size:13px;font-weight:600;color:#2b2b2b;margin-bottom:6px;">
Billing Address
</div>
<div style="font-size:13px;color:#6a645c;line-height:1.5;">
${billingAddress}
</div>
</div>
`
    : ""
}

</td>
</tr>

<!-- Footer -->
<tr>
<td style="background:#f6f2ec;padding:20px;text-align:center;">
<div style="font-size:13px;color:#5e5952;">
If you have any questions, contact us at
<a href="mailto:contact@levants.co.uk"
style="color:#244233;text-decoration:none;font-weight:600;">
contact@levants.co.uk
</a>
</div>

<div style="margin-top:8px;font-size:12px;color:#9c968d;">
© 2025 levants. All rights reserved.
</div>
</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`;
