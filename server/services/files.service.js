// src/services/files.service.js
const fs = require("fs/promises");
const File = require("../models/file.model");
const cloudinary = require("../config/cloudinary.js");
const Product = require("../models/product.model");
const Variant = require("../models/variant.model");
const compressImageForUpload = require("../utils/compressImageForUpload.util");

const getResourceType = (mimeType = "") => {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/") || mimeType.startsWith("audio/"))
    return "video";
  return "raw";
};

const uploadAndCreateFile = async ({
  localPath,
  originalName,
  mimeType,
  sizeBytes,
  uploadedBy,
  folder = "litwebs/files",
} = {}) => {
  if (!localPath) {
    return {
      success: false,
      message: "localPath is required",
    };
  }

  if (!uploadedBy) {
    return {
      success: false,
      message: "uploadedBy is required",
    };
  }

  let uploadResult;
  let uploadPath = localPath;
  let uploadMimeType = mimeType;
  let uploadOriginalName = originalName;
  let uploadSizeBytes = sizeBytes;
  let cleanupPaths = [];

  try {
    const optimizedImage = await compressImageForUpload({
      localPath,
      mimeType,
      originalName,
      sizeBytes,
    });

    uploadPath = optimizedImage.localPath || localPath;
    uploadMimeType = optimizedImage.mimeType || mimeType;
    uploadOriginalName = optimizedImage.originalName || originalName;
    uploadSizeBytes = optimizedImage.sizeBytes || sizeBytes;
    cleanupPaths = Array.isArray(optimizedImage.cleanupPaths)
      ? optimizedImage.cleanupPaths
      : [];

    uploadResult = await cloudinary.uploader.upload(uploadPath, {
      folder,
      resource_type: getResourceType(uploadMimeType),
      use_filename: true,
      unique_filename: true,
      filename_override: uploadOriginalName,
    });
  } finally {
    await Promise.allSettled(
      [...new Set([uploadPath, ...cleanupPaths].filter(Boolean))].map((file) =>
        fs.unlink(file),
      ),
    );
  }

  const file = await File.create({
    originalName: uploadOriginalName,
    filename: uploadResult.public_id,
    mimeType: uploadMimeType,
    sizeBytes: uploadResult.bytes ?? uploadSizeBytes,
    url: uploadResult.secure_url,
    uploadedBy,
  });

  return {
    success: true,
    data: file,
  };
};

const hasCloudinaryCreds = () => {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
  );
};

const isFileReferenced = async (fileId) => {
  if (!fileId) return false;

  const [productThumbCount, productGalleryCount, variantThumbCount] =
    await Promise.all([
      Product.countDocuments({ thumbnailImage: fileId }),
      Product.countDocuments({ galleryImages: fileId }),
      Variant.countDocuments({ thumbnailImage: fileId }),
    ]);

  return productThumbCount + productGalleryCount + variantThumbCount > 0;
};

const deleteFileById = async (fileId, { force = false } = {}) => {
  if (!fileId) return { success: false, message: "fileId is required" };

  const file = await File.findById(fileId);
  if (!file) return { success: true, data: { deleted: false } };

  if (!force) {
    const referenced = await isFileReferenced(file._id);
    if (referenced) {
      return { success: true, data: { deleted: false, referenced: true } };
    }
  }

  // Best-effort remote deletion; DB cleanup is still useful even if CDN fails.
  if (hasCloudinaryCreds() && file.filename) {
    try {
      await cloudinary.uploader.destroy(file.filename, {
        resource_type: getResourceType(file.mimeType),
      });
    } catch (_) {}
  }

  await File.deleteOne({ _id: file._id });
  return { success: true, data: { deleted: true } };
};

const deleteFileIfOrphaned = async (fileId) => {
  return deleteFileById(fileId, { force: false });
};

module.exports = {
  uploadAndCreateFile,
  deleteFileById,
  deleteFileIfOrphaned,
  isFileReferenced,
};
