const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");

const COMPRESSIBLE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const DEFAULT_MAX_WIDTH = 1600;
const DEFAULT_MAX_HEIGHT = 1600;

const OUTPUT_EXTENSION_BY_MIME_TYPE = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const normalizeMimeType = (mimeType = "") => {
  if (mimeType === "image/jpg") return "image/jpeg";
  return String(mimeType || "").toLowerCase();
};

const buildCompressedName = (originalName, mimeType) => {
  if (!originalName) return originalName;

  const parsed = path.parse(originalName);
  const ext = OUTPUT_EXTENSION_BY_MIME_TYPE[mimeType] || parsed.ext;

  return `${parsed.name || "image"}${ext}`;
};

async function compressImageForUpload({
  localPath,
  mimeType,
  originalName,
  sizeBytes,
} = {}) {
  const normalizedMimeType = normalizeMimeType(mimeType);

  if (!localPath || !COMPRESSIBLE_MIME_TYPES.has(normalizedMimeType)) {
    return {
      localPath,
      mimeType: normalizedMimeType || mimeType,
      originalName,
      sizeBytes,
      cleanupPaths: [],
      compressed: false,
    };
  }

  try {
    const metadata = await sharp(localPath, { animated: true }).metadata();

    if (metadata.pages && metadata.pages > 1) {
      return {
        localPath,
        mimeType: normalizedMimeType,
        originalName,
        sizeBytes,
        cleanupPaths: [],
        compressed: false,
      };
    }

    const compressedPath = path.join(
      path.dirname(localPath),
      `${crypto.randomUUID()}${OUTPUT_EXTENSION_BY_MIME_TYPE[normalizedMimeType]}`,
    );

    let pipeline = sharp(localPath).rotate().resize({
      width: DEFAULT_MAX_WIDTH,
      height: DEFAULT_MAX_HEIGHT,
      fit: "inside",
      withoutEnlargement: true,
    });

    if (normalizedMimeType === "image/jpeg") {
      pipeline = pipeline.jpeg({
        quality: 80,
        mozjpeg: true,
        progressive: true,
      });
    } else if (normalizedMimeType === "image/png") {
      pipeline = pipeline.png({
        quality: 80,
        compressionLevel: 9,
        palette: true,
        progressive: true,
      });
    } else if (normalizedMimeType === "image/webp") {
      pipeline = pipeline.webp({
        quality: 80,
        effort: 6,
      });
    }

    await pipeline.toFile(compressedPath);

    const [originalStats, compressedStats] = await Promise.all([
      fs.stat(localPath),
      fs.stat(compressedPath),
    ]);

    const originalSizeBytes = Number(sizeBytes || originalStats.size || 0);

    if (compressedStats.size >= originalSizeBytes) {
      await fs.unlink(compressedPath).catch(() => {});

      return {
        localPath,
        mimeType: normalizedMimeType,
        originalName,
        sizeBytes: originalSizeBytes,
        cleanupPaths: [],
        compressed: false,
      };
    }

    return {
      localPath: compressedPath,
      mimeType: normalizedMimeType,
      originalName: buildCompressedName(originalName, normalizedMimeType),
      sizeBytes: compressedStats.size,
      cleanupPaths: [localPath],
      compressed: true,
    };
  } catch (_) {
    return {
      localPath,
      mimeType: normalizedMimeType || mimeType,
      originalName,
      sizeBytes,
      cleanupPaths: [],
      compressed: false,
    };
  }
}

module.exports = compressImageForUpload;
