// Services/Templates/newOrderAlert.js
module.exports = ({
  orderId,
  customerName,
  customerEmail,
  total,
  currency = "GBP",
  items = [],
  orderDate,
  dashboardUrl,
  logoSrc = "/assets/logo.png",
}) => `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>New Order Received</title>
  </head>

  <body style="margin:0; padding:0; background:#fdfaf6; font-family:'DM Sans', Arial, sans-serif;">

    <!-- Preheader -->
    <div style="display:none; font-size:1px; color:#fdfaf6; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
      New order ${orderId || ""} has been placed.
    </div>

    <!-- Wrapper -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fdfaf6; padding:20px 10px;">
      <tr>
        <td align="center">

          <!-- Container -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0"
            style="max-width:600px; background:#ffffff; border-radius:18px; overflow:hidden; box-shadow:0 20px 40px rgba(0,0,0,0.06);">

            <!-- Header -->
            <tr>
              <td style="background:#244233; padding:24px;" align="left">
                <img
                  src="https://res.cloudinary.com/dkrzhzr4t/image/upload/v1771166319/litwebs/variants/thumbnails/76bfa026-a03c-476c-b481-a07faf8f09de_ofh3ki.png"
                  alt="Levants"
                  width="60"
                  style="display:block; border:0; outline:none; text-decoration:none; margin-bottom:12px; max-width:100%; height:auto;"
                />
                <div style="margin-top:6px; font-size:13px; color:#e8e4dd;">
                  New Order Alert
                </div>
              </td>
            </tr>

            <!-- Gold Divider -->
            <tr>
              <td style="height:4px; background:#d4a017;"></td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:24px 20px;">

                <h2 style="margin:0 0 14px 0; font-family:'Playfair Display', Georgia, serif; font-size:20px; color:#2b2b2b;">
                  A new order has been placed
                </h2>

                <p style="margin:0 0 22px 0; font-size:14px; line-height:1.6; color:#444;">
                  You’ve received a new order. Details are below.
                </p>

                <!-- Order Summary -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0"
                  style="border:1px solid #ece6dc; border-radius:14px; overflow:hidden; margin-bottom:24px;">

                  <tr style="background:#f6f2ec;">
                    <td style="padding:14px; font-size:13px; font-weight:600; color:#2b2b2b;">
                      Order Information
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:16px; font-size:13px; color:#444; line-height:1.8;">

                      <strong>Order ID:</strong> ${orderId || "—"}<br>
                      ${orderDate ? `<strong>Date:</strong> ${orderDate}<br>` : ""}
                      ${customerName ? `<strong>Customer:</strong> ${customerName}<br>` : ""}
                      ${customerEmail ? `<strong>Email:</strong> ${customerEmail}<br>` : ""}
                      <strong>Total:</strong> 
                      <span style="color:#244233; font-weight:700;">
                        ${currency} ${total}
                      </span>

                    </td>
                  </tr>
                </table>

                <!-- Items -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0"
                  style="border:1px solid #ece6dc; border-radius:14px; overflow:hidden; margin-bottom:28px;">

                  <tr style="background:#f6f2ec;">
                    <td style="padding:12px; font-size:13px; font-weight:600; color:#2b2b2b;">
                      Item
                    </td>
                    <td align="center" style="padding:12px; font-size:13px; font-weight:600; color:#2b2b2b;">
                      Qty
                    </td>
                    <td align="right" style="padding:12px; font-size:13px; font-weight:600; color:#2b2b2b;">
                      Subtotal
                    </td>
                  </tr>

                  ${(items || [])
                    .map(
                      (item) => `
                    <tr>
                      <td style="padding:12px; font-size:13px; color:#444;">
                        ${item.name}
                      </td>
                      <td align="center" style="padding:12px; font-size:13px; color:#444;">
                        ${item.quantity}
                      </td>
                      <td align="right" style="padding:12px; font-size:13px; color:#444;">
                        ${currency} ${item.subtotal}
                      </td>
                    </tr>
                    `,
                    )
                    .join("")}

                </table>

                ${
                  dashboardUrl
                    ? `
                <!-- CTA -->
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
                           padding:12px 24px;
                           border-radius:8px;
                         ">
                        View Order in Dashboard
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
              <td style="background:#f6f2ec; padding:20px;" align="center">
                <div style="font-size:13px; color:#5e5952;">
                  This is an automated notification from levants.
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
