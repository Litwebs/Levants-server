// Services/Templates/submissionReply.js
const { getLogoCidSrc } = require("./logoAttachment");

module.exports = ({
  name = "there",
  subject = "Re: your enquiry",
  replyMessage = "",
  originalSubject = "",
  supportEmail = "contact@litwebs.co.uk",
  brandName = "LITWEBS SOLUTIONS",
  logoSrc = getLogoCidSrc(), // default to CID
}) => {
  const safeReply = String(replyMessage || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const safeOriginalSubject = String(originalSubject || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const safeSubject = String(subject || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const safeName = String(name || "there")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${safeSubject}</title>
    <style>
      @media (max-width: 560px) {
        .container { width: 100% !important; }
        .px { padding-left: 18px !important; padding-right: 18px !important; }
        .card { padding: 18px !important; }
        .h1 { font-size: 20px !important; }
        .logo { width: 44px !important; height: 44px !important; }
      }
    </style>
  </head>

  <body style="margin:0; padding:0; background:#f3f6fb;">
    <div style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
      We’ve replied to your Litwebs enquiry.
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f6fb; padding:28px 0;">
      <tr>
        <td align="center" style="padding:0 14px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" class="container" style="width:560px; max-width:560px;">
            <tr>
              <td class="px" style="padding:0 6px;">

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="
                  background:#153a5b;
                  border-radius:16px;
                  overflow:hidden;
                  border:1px solid #dbe5f1;
                ">
                  <tr>
                    <td style="padding:18px 20px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                        <tr>
                          <td valign="middle" style="width:60px;">
                            <img
                              class="logo"
                              src="${logoSrc}"
                              width="52"
                              height="52"
                              alt="Litwebs logo"
                              style="display:block; border:0; outline:none; text-decoration:none; border-radius:10px;"
                            />
                          </td>
                          <td valign="middle" style="padding-left:12px;">
                            <div style="font-family:Arial, sans-serif; color:#ffffff; font-size:14px; letter-spacing:2px; line-height:1.2;">
                              ${brandName}
                            </div>
                            <div style="font-family:Arial, sans-serif; color:rgba(255,255,255,0.78); font-size:12px; line-height:1.4; margin-top:4px;">
                              Reply to your enquiry
                            </div>
                          </td>
                          <td valign="middle" align="right" style="padding-left:10px;">
                            <div style="font-family:Arial, sans-serif; color:rgba(255,255,255,0.85); font-size:12px; line-height:1.2;">
                              ${new Date().getFullYear()}
                            </div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <div style="height:14px; line-height:14px; font-size:0;">&nbsp;</div>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="
                  background:#ffffff;
                  border-radius:16px;
                  overflow:hidden;
                  border:1px solid #dbe5f1;
                  box-shadow: 0 10px 26px rgba(21,58,91,0.10);
                ">
                  <tr>
                    <td class="card" style="padding:24px;">
                      <div style="font-family:Arial, sans-serif; color:#5b6b7a; font-size:12px; letter-spacing:0.6px; text-transform:uppercase;">
                        Message from our team
                      </div>

                      <div class="h1" style="margin:10px 0 10px 0; font-family:Arial, sans-serif; font-size:22px; line-height:1.35; color:#0f172a;">
                        Hi ${safeName},
                      </div>

                      ${
                        safeOriginalSubject
                          ? `<div style="margin:0 0 14px 0; font-family:Arial, sans-serif; font-size:13px; line-height:1.65; color:#334155;">
                               About: <span style="color:#0f172a;">${safeOriginalSubject}</span>
                             </div>`
                          : ""
                      }

                      <!-- Reply block (fixed formatting / alignment) -->
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:12px 0 6px 0;">
                        <tr>
                          <td
                            valign="top"
                            style="width:6px; background:#153a5b; border-radius:12px 0 0 12px; font-size:0; line-height:0;"
                          >&nbsp;</td>

                          <td
                            valign="top"
                            align="left"
                            style="padding:14px 16px; background:#f7fafc; border:1px solid #e6eef8; border-left:0; border-radius:0 12px 12px 0;"
                          >
                            <div style="font-family:Arial, sans-serif; font-size:12px; color:#5b6b7a; letter-spacing:0.4px; text-transform:uppercase; margin:0 0 8px 0; text-align:left;">
                              Our reply
                            </div>

                            <div style="
                              font-family:Arial, sans-serif;
                              font-size:14px;
                              line-height:1.75;
                              color:#0f172a;
                              white-space:pre-wrap;
                              text-align:left;
                              margin:0;
                              padding:0;
                              word-break:break-word;
                              overflow-wrap:anywhere;
                            ">${safeReply}</div>
                          </td>
                        </tr>
                      </table>

                      <div style="height:1px; background:#e6eef8; margin:18px 0;"></div>

                      <div style="font-family:Arial, sans-serif; font-size:12px; line-height:1.7; color:#5b6b7a;">
                        If you need anything else, just reply to this email or contact us at
                        <a href="mailto:${supportEmail}" style="color:#153a5b; text-decoration:underline;">${supportEmail}</a>.
                      </div>
                    </td>
                  </tr>
                </table>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td align="center" style="padding:14px 8px 0 8px;">
                      <div style="font-family:Arial, sans-serif; font-size:12px; color:#6b7c8f; line-height:1.6;">
                        &copy; ${new Date().getFullYear()} Litwebs. All rights reserved.
                      </div>
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
</html>`;
};
