module.exports = ({
  name = "there",
  orderId,
  proofUrl,
  deliveredAt,
  logoSrc = "./assets/logo.png",
}) => {
  const safeProofUrl = String(proofUrl || "").trim();

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Delivered</title>
</head>

<body style="margin:0;padding:0;background:#fdfaf6;font-family:Arial,sans-serif;">

<!-- Preheader -->
<div style="display:none;font-size:1px;color:#fdfaf6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
Your levants order ${orderId || ""} has been delivered.
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
<img src="${String(logoSrc || "").trim()}" alt="Levants" width="60"
     style="display:block;margin-bottom:12px;max-width:100%;height:auto;" />

<div style="font-size:13px;color:#e8e4dd;">Delivery Confirmation</div>

</td>
</tr>

<!-- Gold Divider -->
<tr>
<td style="height:4px;background:#d4a017;"></td>
</tr>

<!-- Body -->
<tr>
<td style="padding:24px 20px;">

<h2 style="margin:0 0 14px 0;font-size:20px;color:#2b2b2b;">Hi ${name}.</h2>

<p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#444;">
Your order has been marked as <b>delivered</b>.
</p>

<!-- Meta -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
<tr>
<td style="font-size:13px;color:#7a746c;">Order ID:</td>
<td align="right" style="font-size:13px;color:#2b2b2b;font-weight:600;">${orderId || "—"}</td>
</tr>
${
  deliveredAt
    ? `
<tr>
<td style="font-size:13px;color:#7a746c;padding-top:6px;">Delivered at:</td>
<td align="right" style="font-size:13px;color:#2b2b2b;padding-top:6px;">${deliveredAt}</td>
</tr>
`
    : ""
}
</table>

<!-- Proof -->
<div style="margin:0 0 18px 0;">
<div style="font-size:13px;font-weight:600;color:#2b2b2b;margin-bottom:8px;">Delivery proof</div>
${
  safeProofUrl
    ? `
<img src="${safeProofUrl}" alt="Delivery proof" width="560"
     style="display:block;width:100%;max-width:560px;height:auto;border-radius:10px;border:1px solid #ece6dc;" />
`
    : `
<div style="font-size:13px;color:#6a645c;line-height:1.5;border:1px solid #ece6dc;border-radius:10px;padding:12px;background:#f6f2ec;">
No delivery photo was attached for this order.
</div>
`
}
</div>

</td>
</tr>

<!-- Footer -->
<tr>
<td style="background:#f6f2ec;padding:20px;text-align:center;">
<div style="font-size:13px;color:#5e5952;">
If you have any questions, contact us at
<a href="mailto:contact@levants.co.uk" style="color:#244233;text-decoration:none;font-weight:600;">contact@levants.co.uk</a>
</div>

<div style="margin-top:8px;font-size:12px;color:#9c968d;">© 2026 levants. All rights reserved.</div>
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
