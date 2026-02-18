// Services/Templates/verifyEmailChange.js
module.exports = ({
  name = "there",
  verifyLink,
  expiresInMinutes = 60,
  logoSrc = "https://res.cloudinary.com/dkrzhzr4t/image/upload/v1771166319/litwebs/variants/thumbnails/76bfa026-a03c-476c-b481-a07faf8f09de_ofh3ki.png",
}) => `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Confirm Your New Email</title>
  </head>

  <body style="margin:0; padding:0; background:#fdfaf6; font-family:'DM Sans', Arial, sans-serif;">

    <!-- Preheader -->
    <div style="display:none; font-size:1px; color:#fdfaf6; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
      Confirm your new levants email address.
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
              <td style="background:#244233; padding:30px 30px 24px 30px;" align="left">
                <img
                  src="${logoSrc}"
                  alt="Levants"
                  width="52"
                  height="52"
                  style="display:block; border:0; outline:none; text-decoration:none; margin-bottom:12px; width:52px; height:52px; border-radius:9999px; object-fit:cover;"
                />
                <div style="margin-top:6px; font-size:13px; color:#e8e4dd;">
                  Confirm New Email Address
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

                <h2 style="margin:0 0 14px 0; font-family:'Playfair Display', Georgia, serif; font-size:24px; color:#2b2b2b;">
                  Hello ${name},
                </h2>

                <p style="margin:0 0 22px 0; font-size:15px; line-height:1.7; color:#444;">
                  You requested to change the email address on your levants account.
                  Please confirm this change by clicking the button below.
                </p>

                <p style="margin:0 0 18px 0; font-size:14px; line-height:1.7; color:#6a645c;">
                  This link expires in <strong>${expiresInMinutes} minutes</strong>.
                </p>

                <!-- Button -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 18px 0;">
                  <tr>
                    <td align="center">
                      <a href="${verifyLink}"
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
                        Confirm New Email
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 18px 0; font-size:14px; line-height:1.7; color:#6a645c;">
                  If you didn’t request this change, you can safely ignore this email.
                  Your account email will remain unchanged.
                </p>

                <!-- Divider -->
                <div style="border-top:1px solid #ece6dc; margin:22px 0;"></div>

                <!-- Fallback -->
                <div style="font-size:12px; line-height:1.6; color:#8a847c;">
                  If the button doesn’t work, copy and paste this link into your browser:
                  <br><br>
                  <a href="${verifyLink}"
                     style="color:#244233; word-break:break-all; text-decoration:none; font-weight:600;">
                    ${verifyLink}
                  </a>
                </div>

              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f6f2ec; padding:24px 20px;" align="center">

                <div style="font-size:13px; color:#5e5952;">
                  Need help?
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
