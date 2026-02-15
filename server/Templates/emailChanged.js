module.exports = ({
  name = "there",
  oldEmail,
  newEmail,
  when,
  securityUrl,
  logoSrc = "/assests/logo.png",
}) => `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Email Changed</title>
  </head>

  <body style="margin:0; padding:0; background:#fdfaf6; font-family: 'DM Sans', Arial, sans-serif;">

    <!-- Wrapper -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fdfaf6; padding:40px 0;">
      <tr>
        <td align="center">

          <!-- Container -->
          <table width="560" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff; border-radius:18px; overflow:hidden; box-shadow:0 20px 40px rgba(0,0,0,0.06);">

            <!-- Header -->
            <tr>
              <td style="background:#244233; padding:30px 30px 24px 30px;" align="left">
                <img
                  src="https://res.cloudinary.com/dkrzhzr4t/image/upload/v1771166319/litwebs/variants/thumbnails/76bfa026-a03c-476c-b481-a07faf8f09de_ofh3ki.png"
                  alt="Levants"
                  width="60"
                  style="display:block; border:0; outline:none; text-decoration:none; margin-bottom:12px; max-width:100%; height:auto;"
                />
                <div style="margin-top:6px; font-size:13px; color:#e8e4dd;">
                  Account Security Notice
                </div>
              </td>
            </tr>

            <!-- Gold Divider -->
            <tr>
              <td style="height:4px; background:#d4a017;"></td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:36px 32px;">

                <h2 style="margin:0 0 14px 0; font-family: 'Playfair Display', Georgia, serif; font-size:24px; color:#2b2b2b;">
                  Hello ${name},
                </h2>

                <p style="margin:0 0 20px 0; font-size:15px; line-height:1.7; color:#444;">
                  This is a confirmation that your levants account email address has been successfully updated.
                </p>

                <!-- Info Box -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f2ec; border-radius:14px; border:1px solid #ece6dc; padding:18px;">
                  <tr>
                    <td style="padding:18px;">

                      <div style="font-size:12px; color:#7a746c; margin-bottom:4px;">
                        Changed from
                      </div>
                      <div style="font-size:15px; font-weight:600; color:#2b2b2b;">
                        ${oldEmail || "—"}
                      </div>

                      <div style="height:16px;"></div>

                      <div style="font-size:12px; color:#7a746c; margin-bottom:4px;">
                        Changed to
                      </div>
                      <div style="font-size:15px; font-weight:600; color:#2b2b2b;">
                        ${newEmail || "—"}
                      </div>

                      ${
                        when
                          ? `
                        <div style="height:16px;"></div>
                        <div style="font-size:12px; color:#7a746c; margin-bottom:4px;">
                          Time
                        </div>
                        <div style="font-size:14px; color:#2b2b2b;">
                          ${when}
                        </div>
                        `
                          : ""
                      }

                    </td>
                  </tr>
                </table>

                <p style="margin:22px 0 20px 0; font-size:14px; line-height:1.7; color:#6a645c;">
                  If you did not make this change, please secure your account immediately.
                </p>

                ${
                  securityUrl
                    ? `
                <!-- Button -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center">
                      <a href="${securityUrl}" 
                         style="
                           display:inline-block;
                           background:#244233;
                           color:#ffffff;
                           font-size:14px;
                           font-weight:600;
                           text-decoration:none;
                           padding:14px 28px;
                           border-radius:12px;
                           border:2px solid #244233;
                         ">
                        Review Account Security
                      </a>
                    </td>
                  </tr>
                </table>

                <div style="margin-top:18px; font-size:12px; color:#8a847c; text-align:center; line-height:1.6;">
                  If the button doesn't work, copy and paste this link into your browser:<br>
                  <a href="${securityUrl}" style="color:#244233; word-break:break-all;">
                    ${securityUrl}
                  </a>
                </div>
                    `
                    : ""
                }

              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f6f2ec; padding:24px 20px;" align="center">
                <div style="font-size:13px; color:#5e5952;">
                  Need help?
                  <a href="mailto:contact@levants.co.uk" style="color:#244233; text-decoration:none; font-weight:600;">
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
