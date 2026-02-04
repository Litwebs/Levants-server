// Services/Templates/login2FA.js
module.exports = ({ name = "there", code, expiresMinutes = 10, ip }) => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>Your login code</title>
    <style>
      @media (max-width: 520px) {
        .container { width: 100% !important; }
        .px { padding-left: 18px !important; padding-right: 18px !important; }
        .card { padding: 18px !important; }
        .btn { width: 100% !important; }
      }
    </style>
  </head>

  <body style="margin:0; padding:0; background:#0b0b0f;">
    <!-- Preheader (hidden) -->
    <div style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
      Your Litwebs login code is ${String(code || "").slice(0, 6)}.
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0b0b0f; padding:26px 0;">
      <tr>
        <td align="center" style="padding:0 14px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="500" class="container" style="width:500px; max-width:500px;">
            <tr>
              <td class="px" style="padding:0 6px;">

                <!-- Header -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td align="left" style="padding:10px 6px 16px 6px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td valign="middle" style="padding-right:10px;">
                            <div
                              style="
                                width:34px;
                                height:34px;
                                border-radius:10px;
                                background:linear-gradient(135deg,#6ee7ff,#a78bfa,#22c55e);
                                display:block;
                              "
                            ></div>
                          </td>

                          <td valign="middle" style="padding:0;">
                            <div
                              style="
                                font-family:Arial, sans-serif;
                                font-size:18px;
                                font-weight:700;
                                color:#ffffff;
                                letter-spacing:0.2px;
                                line-height:1.1;
                                margin:0;
                                padding:0;
                              "
                            >
                              Litwebs
                            </div>

                            <div
                              style="
                                font-family:Arial, sans-serif;
                                font-size:12px;
                                color:#a3a3a3;
                                line-height:1.2;
                                margin:4px 0 0 0;
                                padding:0;
                              "
                            >
                              Two-factor login code
                            </div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <!-- Card -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="
                  background:#ffffff;
                  border-radius:16px;
                  overflow:hidden;
                  border:1px solid rgba(255,255,255,0.10);
                  box-shadow: 0 12px 32px rgba(0,0,0,0.35);
                ">
                  <!-- Accent bar -->
                  <tr>
                    <td style="height:6px; background:linear-gradient(90deg,#6ee7ff,#a78bfa,#22c55e); line-height:6px; font-size:0;">
                      &nbsp;
                    </td>
                  </tr>

                  <tr>
                    <td class="card" style="padding:22px;">
                      <div style="font-family:Arial, sans-serif; font-size:12px; color:#6b7280; letter-spacing:0.3px; text-transform:uppercase;">
                        Login verification
                      </div>

                      <h2 style="margin:10px 0 8px 0; font-family:Arial, sans-serif; font-size:22px; line-height:1.25; color:#111827;">
                        Hi ${name},
                      </h2>

                      <p style="margin:0 0 14px 0; font-family:Arial, sans-serif; font-size:14px; line-height:1.6; color:#374151;">
                        Use the code below to finish signing in to your Litwebs account.
                      </p>

                      <!-- Code block -->
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:14px 0 14px 0;">
                        <tr>
                          <td align="center" style="padding:14px; background:#f8fafc; border:1px solid #eef2f7; border-radius:14px;">
                            <div style="font-family:Arial, sans-serif; font-size:12px; color:#6b7280; margin:0 0 6px 0; text-transform:uppercase; letter-spacing:0.2px;">
                              Your code
                            </div>
                            <div style="font-family:Arial, sans-serif; font-size:28px; font-weight:800; letter-spacing:6px; color:#111827;">
                              ${String(code || "------")}
                            </div>
                          </td>
                        </tr>
                      </table>

                      <p style="margin:0; font-family:Arial, sans-serif; font-size:13px; line-height:1.6; color:#6b7280;">
                        This code expires in ${Number(expiresMinutes || 10)} minutes.
                        Do not share it with anyone.
                      </p>

                      ${
                        ip
                          ? `
                      <div style="height:1px; background:#eef2f7; margin:18px 0;"></div>
                      <p style="margin:0; font-family:Arial, sans-serif; font-size:12px; line-height:1.6; color:#6b7280;">
                        Request details: IP <span style="color:#111827; font-weight:700;">${ip}</span>
                      </p>
                          `
                          : `
                      <div style="height:1px; background:#eef2f7; margin:18px 0;"></div>
                      <p style="margin:0; font-family:Arial, sans-serif; font-size:12px; line-height:1.6; color:#6b7280;">
                        If you didn’t try to sign in, we recommend changing your password.
                      </p>
                          `
                      }
                    </td>
                  </tr>
                </table>

                <!-- Footer -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td align="center" style="padding:14px 8px 0 8px;">
                      <p style="margin:0; font-family:Arial, sans-serif; font-size:12px; color:#a3a3a3;">
                        Need help?
                        <a href="mailto:contact@litwebs.co.uk" style="color:#ffffff; text-decoration:none; border-bottom:1px solid rgba(255,255,255,0.35);">
                          contact@litwebs.co.uk
                        </a>
                      </p>
                      <p style="margin:8px 0 0 0; font-family:Arial, sans-serif; font-size:12px; color:#6b7280;">
                        &copy; 2025 Litwebs. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>

              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
