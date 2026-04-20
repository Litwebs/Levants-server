const crypto = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const sharp = require("sharp");

const compressImageForUpload = require("../../utils/compressImageForUpload.util");

describe("compressImageForUpload", () => {
  test("compresses large jpeg uploads and keeps cleanup metadata", async () => {
    const localPath = path.join(os.tmpdir(), `${crypto.randomUUID()}.jpg`);

    await sharp({
      create: {
        width: 3200,
        height: 2400,
        channels: 3,
        background: { r: 180, g: 90, b: 20 },
      },
    })
      .jpeg({ quality: 100 })
      .toFile(localPath);

    const originalStats = await fs.stat(localPath);

    const result = await compressImageForUpload({
      localPath,
      mimeType: "image/jpeg",
      originalName: "product-photo.jpeg",
      sizeBytes: originalStats.size,
    });

    expect(result.compressed).toBe(true);
    expect(result.localPath).not.toBe(localPath);
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.originalName).toBe("product-photo.jpg");
    expect(result.cleanupPaths).toEqual([localPath]);
    expect(result.sizeBytes).toBeLessThan(originalStats.size);

    const compressedMeta = await sharp(result.localPath).metadata();
    expect(compressedMeta.width).toBeLessThanOrEqual(1600);
    expect(compressedMeta.height).toBeLessThanOrEqual(1600);

    await fs.unlink(result.localPath);
    await fs.unlink(localPath).catch(() => {});
  });

  test("skips unsupported image formats", async () => {
    const localPath = path.join(os.tmpdir(), `${crypto.randomUUID()}.gif`);

    await fs.writeFile(
      localPath,
      Buffer.from(
        "47494638396101000100800000ffffff00000021f90401000000002c00000000010001000002024401003b",
        "hex",
      ),
    );

    const result = await compressImageForUpload({
      localPath,
      mimeType: "image/gif",
      originalName: "tiny.gif",
      sizeBytes: 43,
    });

    expect(result.compressed).toBe(false);
    expect(result.localPath).toBe(localPath);
    expect(result.cleanupPaths).toEqual([]);

    await fs.unlink(localPath).catch(() => {});
  });
});
