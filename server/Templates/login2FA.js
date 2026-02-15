// Services/Templates/login2FA.js
module.exports = ({
  name = "there",
  code,
  expiresMinutes = 10,
  ip,
  logoSrc = "/assests/logo.png",
}) => `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Your Login Code</title>
  </head>

  <body style="margin:0; padding:0; background:#fdfaf6; font-family: 'DM Sans', Arial, sans-serif;">

    <!-- Preheader (hidden preview text) -->
    <div style="display:none; font-size:1px; color:#fdfaf6; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
      Your levants login code is ${String(code || "").slice(0, 6)}.
    </div>

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
                  Two-Factor Login Code
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

                <p style="margin:0 0 22px 0; font-size:15px; line-height:1.7; color:#444;">
                  Use the verification code below to complete your sign-in to your levants account.
                </p>

                <!-- Code Box -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f2ec; border-radius:16px; border:1px solid #ece6dc;">
                  <tr>
                    <td align="center" style="padding:28px 20px;">

                      <div style="font-size:12px; letter-spacing:1px; text-transform:uppercase; color:#7a746c; margin-bottom:10px;">
                        Your Verification Code
                      </div>

                      <div style="
                        font-size:34px;
                        font-weight:700;
                        letter-spacing:8px;
                        color:#244233;
                        font-family: Arial, sans-serif;
                      ">
                        ${String(code || "------")}
                      </div>

                    </td>
                  </tr>
                </table>

                <p style="margin:22px 0 0 0; font-size:14px; line-height:1.7; color:#6a645c;">
                  This code expires in <strong>${Number(expiresMinutes || 10)} minutes</strong>.
                  For security reasons, do not share this code with anyone.
                </p>

                ${
                  ip
                    ? `
                <div style="margin-top:22px; padding-top:18px; border-top:1px solid #ece6dc;">
                  <div style="font-size:12px; color:#7a746c; margin-bottom:6px;">
                    Login request details
                  </div>
                  <div style="font-size:13px; color:#2b2b2b;">
                    IP Address: <span style="font-weight:600;">${ip}</span>
                  </div>
                </div>
                    `
                    : `
                <div style="margin-top:22px; padding-top:18px; border-top:1px solid #ece6dc;">
                  <div style="font-size:13px; color:#6a645c;">
                    If you did not attempt to sign in, we recommend changing your password immediately.
                  </div>
                </div>
                    `
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
