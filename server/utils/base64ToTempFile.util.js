// src/utils/base64ToTempFile.util.js
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

module.exports = async function base64ToTempFile(base64) {
  const match = base64.match(/^data:(.+);base64,(.+)$/);
  if (!match) return null;

  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");

  const ext = mimeType.split("/")[1] || "bin";
  const filename = `${crypto.randomUUID()}.${ext}`;
  const localPath = path.join("/tmp", filename);

  await fs.writeFile(localPath, buffer);

  return {
    localPath,
    originalName: filename,
    mimeType,
    sizeBytes: buffer.length,
  };
};
