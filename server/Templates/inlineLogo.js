// Services/Templates/inlineLogo.js
const fs = require("fs");
const path = require("path");

const LOGO_CONTENT_ID = "litwebs-logo";
let cachedBase64 = null;

function getLogoBase64() {
  if (cachedBase64) return cachedBase64;
  const logoPath = path.join(__dirname, "assets", "logo.png"); // put your logo here
  cachedBase64 = fs.readFileSync(logoPath).toString("base64");
  return cachedBase64;
}

function getInlineLogoAttachment() {
  return {
    filename: "lw-logo.png",
    content: getLogoBase64(),
    contentId: LOGO_CONTENT_ID,
  };
}

function getLogoCidSrc() {
  return `cid:${LOGO_CONTENT_ID}`;
}

module.exports = { LOGO_CONTENT_ID, getInlineLogoAttachment, getLogoCidSrc };
