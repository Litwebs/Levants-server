// Services/Templates/refundConfirmation.js
module.exports = ({
  name = "there",
  orderId,
  refundDate,
  total,
  currency = "GBP",
  logoSrc = "/assests/logo.png",
} = {}) => `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Refund Confirmation</title>
  </head>

  <body style="margin:0; padding:0; background:#fdfaf6; font-family:'DM Sans', Arial, sans-serif;">

    <!-- Preheader -->
    <div style="display:none; font-size:1px; color:#fdfaf6; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
      Your levants refund${orderId ? ` for order ${orderId}` : ""} has been processed.
    </div>

    <!-- Wrapper -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fdfaf6; padding:40px 0;">
      <tr>
        <td align="center">

          <!-- Container -->
          <table width="600" cellpadding="0" cellspacing="0" border="0"
            style="background:#ffffff; border-radius:18px; overflow:hidden; box-shadow:0 20px 40px rgba(0,0,0,0.06);">

            <!-- Header -->
            <tr>
              <td style="background:#244233; padding:30px;" align="left">
                <img
                  src="https://res.cloudinary.com/dkrzhzr4t/image/upload/v1771166319/litwebs/variants/thumbnails/76bfa026-a03c-476c-b481-a07faf8f09de_ofh3ki.png"
                  alt="Levants"
                  width="60"
                  style="display:block; border:0; outline:none; text-decoration:none; margin-bottom:12px; max-width:100%; height:auto;"
                />
                <div style="margin-top:6px; font-size:13px; color:#e8e4dd;">
                  Refund Confirmation
                </div>
              </td>
            </tr>

            <!-- Gold Divider -->
            <tr>
              <td style="height:4px; background:#d4a017;"></td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:36px;">

                <h2 style="margin:0 0 14px 0; font-family:'Playfair Display', Georgia, serif; font-size:24px; color:#2b2b2b;">
                  Hi, ${name}.
                </h2>

                <p style="margin:0 0 20px 0; font-size:15px; line-height:1.7; color:#444;">
                  We’ve processed your refund${orderId ? ` for order <strong>${orderId}</strong>` : ""}.
                </p>

                <!-- Refund Meta -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
                  ${
                    orderId
                      ? `
                  <tr>
                    <td style="font-size:13px; color:#7a746c;">Order ID:</td>
                    <td align="right" style="font-size:13px; color:#2b2b2b; font-weight:600;">
                      ${orderId}
                    </td>
                  </tr>
                  `
                      : ""
                  }
                  ${
                    refundDate
                      ? `
                  <tr>
                    <td style="font-size:13px; color:#7a746c; padding-top:6px;">Refund Date:</td>
                    <td align="right" style="font-size:13px; color:#2b2b2b; padding-top:6px;">
                      ${refundDate}
                    </td>
                  </tr>
                  `
                      : ""
                  }
                  ${
                    total
                      ? `
                  <tr>
                    <td style="font-size:13px; color:#7a746c; padding-top:6px;">Refund Amount:</td>
                    <td align="right" style="font-size:13px; color:#244233; font-weight:700; padding-top:6px;">
                      ${currency} ${total}
                    </td>
                  </tr>
                  `
                      : ""
                  }
                </table>

                <p style="margin:0; font-size:13px; line-height:1.7; color:#6a645c;">
                  Depending on your bank, it may take a few business days for the funds to appear.
                </p>

              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f6f2ec; padding:24px;" align="center">
                <div style="font-size:13px; color:#5e5952;">
                  If you have any questions, contact us at
                  <a href="mailto:contact@levants.co.uk"
                     style="color:#244233; text-decoration:none; font-weight:600;">
                    contact@levants.co.uk
                  </a>
                </div>

                <div style="margin-top:10px; font-size:12px; color:#9c968d;">
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
