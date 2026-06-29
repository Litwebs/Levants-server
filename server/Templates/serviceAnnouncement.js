module.exports = ({
  customerName = "Customer",
  title = "",
  description = "",
  logoSrc = "",
}) => {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
</head>

<body style="
  margin:0;
  padding:0;
  background:#f5f5f5;
  font-family:Arial, Helvetica, sans-serif;
">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
<tr>
<td align="center">

<table width="620" cellpadding="0" cellspacing="0" style="
  background:#ffffff;
  border-radius:10px;
  overflow:hidden;
  border:1px solid #e5e5e5;
">

${
  logoSrc
    ? `
<tr>
<td align="center" style="padding:32px 0 20px;">
<img
  src="${logoSrc}"
  alt="Logo"
  style="max-width:180px;height:auto;"
/>
</td>
</tr>
`
    : ""
}

<tr>
<td style="padding:10px 40px 0;">

<h1 style="
  margin:0 0 24px;
  color:#222;
  font-size:28px;
  font-weight:700;
">
${title}
</h1>

<p style="
  font-size:16px;
  color:#444;
  line-height:1.7;
">
Hello ${customerName},
</p>

<p style="
  font-size:16px;
  color:#444;
  line-height:1.8;
  white-space:pre-line;
">
${description}
</p>

<p style="
  margin-top:32px;
  font-size:15px;
  color:#555;
  line-height:1.7;
">
Thank you for your continued support.
</p>

<p style="
  margin-top:24px;
  font-size:15px;
  color:#222;
  font-weight:bold;
">
Levants Team
</p>

</td>
</tr>

<tr>
<td style="
  padding:24px;
  background:#fafafa;
  border-top:1px solid #ececec;
  text-align:center;
  color:#777;
  font-size:12px;
">
This is an operational service announcement regarding your account or orders.
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
