// src/services/files.service.js
const fs = require("fs/promises");
const File = require("../models/file.model");
const cloudinary = require("../config/cloudinary.js");

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

  try {
    uploadResult = await cloudinary.uploader.upload(localPath, {
      folder,
      resource_type: getResourceType(mimeType),
      use_filename: true,
      unique_filename: true,
      filename_override: originalName,
    });
  } finally {
    // cleanup temp file
    try {
      await fs.unlink(localPath);
    } catch (_) {}
  }

  const file = await File.create({
    originalName,
    filename: uploadResult.public_id,
    mimeType,
    sizeBytes: uploadResult.bytes ?? sizeBytes,
    url: uploadResult.secure_url,
    uploadedBy,
  });

  return {
    success: true,
    data: file,
  };
};

module.exports = {
  uploadAndCreateFile,
};
