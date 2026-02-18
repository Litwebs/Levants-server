// Services/Templates/lowStockAlert.js
module.exports = ({
  productName,
  sku,
  currentStock,
  threshold,
  dashboardUrl,
  logoSrc = "/assets/logo.png",
}) => `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Low Stock Alert</title>
  </head>

  <body style="margin:0; padding:0; background:#fdfaf6; font-family:'DM Sans', Arial, sans-serif;">

    <!-- Preheader -->
    <div style="display:none; font-size:1px; color:#fdfaf6; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
      Low stock alert for ${productName || "a product"}.
    </div>

    <!-- Wrapper -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fdfaf6; padding:40px 0;">
      <tr>
        <td align="center">

          <!-- Container -->
          <table width="560" cellpadding="0" cellspacing="0" border="0"
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
                  Inventory Alert
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

                <h2 style="margin:0 0 14px 0; font-family:'Playfair Display', Georgia, serif; font-size:22px; color:#2b2b2b;">
                  Low Stock Warning
                </h2>

                <p style="margin:0 0 22px 0; font-size:15px; line-height:1.7; color:#444;">
                  One of your products is running low and requires attention.
                </p>

                <!-- Alert Box -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0"
                  style="background:#fff8e6; border:1px solid #f0d9a6; border-radius:14px;">

                  <tr>
                    <td style="padding:22px;">

                      <div style="font-size:14px; font-weight:600; color:#2b2b2b; margin-bottom:12px;">
                        ${productName || "Unnamed Product"}
                      </div>

                      ${
                        sku
                          ? `
                      <div style="font-size:12px; color:#7a746c; margin-bottom:10px;">
                        SKU: <span style="color:#2b2b2b; font-weight:600;">${sku}</span>
                      </div>
                      `
                          : ""
                      }

                      <div style="font-size:13px; color:#6a645c; margin-bottom:6px;">
                        Current stock:
                        <span style="color:#c2410c; font-weight:700;">
                          ${currentStock ?? 0}
                        </span>
                      </div>

                      ${
                        threshold !== undefined
                          ? `
                      <div style="font-size:13px; color:#6a645c;">
                        Alert threshold:
                        <span style="color:#2b2b2b; font-weight:600;">
                          ${threshold}
                        </span>
                      </div>
                      `
                          : ""
                      }

                    </td>
                  </tr>
                </table>

                <p style="margin:22px 0 24px 0; font-size:14px; line-height:1.7; color:#6a645c;">
                  We recommend restocking this item soon to avoid stockouts
                  and potential missed sales.
                </p>

                ${
                  dashboardUrl
                    ? `
                <!-- Button -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center">
                      <a href="${dashboardUrl}"
                         style="
                           display:inline-block;
                           background:#244233;
                           color:#ffffff;
                           font-size:14px;
                           font-weight:600;
                           text-decoration:none;
                           padding:14px 30px;
                           border-radius:12px;
                           border:2px solid #244233;
                         ">
                        View in Dashboard
                      </a>
                    </td>
                  </tr>
                </table>
                    `
                    : ""
                }

              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f6f2ec; padding:24px;" align="center">
                <div style="font-size:13px; color:#5e5952;">
                  This is an automated inventory notification from levants.
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
