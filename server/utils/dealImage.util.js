"use strict";

const MAX_DEAL_IMAGE_BYTES = 5 * 1024 * 1024;

function parseDealImageData(value) {
  const invalid = () => { throw Object.assign(new Error("Choose a JPG, PNG or WEBP image"), { statusCode: 400 }); };
  if (typeof value !== "string") return invalid();
  // Match only the short header. Repeating a regex over multi-megabyte Base64
  // payloads can exhaust V8's regex stack before the decoded-size check.
  const header = /^data:image\/(jpeg|png|webp);base64,/.exec(value.slice(0, 40));
  if (!header) return invalid();
  const encoded = value.slice(header[0].length);
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  const decodedSize = encoded.length / 4 * 3 - padding;
  if (decodedSize > MAX_DEAL_IMAGE_BYTES)
    throw Object.assign(new Error("Deal images must be 5 MB or smaller"), { statusCode: 400 });
  if (!encoded.length || encoded.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(encoded) || encoded.slice(0, encoded.length - padding).includes("=")) return invalid();
  return { format: header[1], encoded, decodedSize };
}

module.exports = { MAX_DEAL_IMAGE_BYTES, parseDealImageData };
