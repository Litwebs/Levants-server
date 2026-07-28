const BusinessInfo = require("../models/businessInfo.model");
const fs = require("fs/promises");
const base64ToTempFile = require("../utils/base64ToTempFile.util");
const {
  uploadAndCreateFile,
  deleteFileIfOrphaned,
} = require("./files.service");
const {
  BUSINESS_LOGO_MAX_BYTES,
} = require("../config/uploadLimits");

const SINGLETON_KEY = "business-info";

async function getBusinessInfo() {
  let info = await BusinessInfo.findOne({
    singletonKey: SINGLETON_KEY,
  }).populate("logo");

  // Backward compatibility: older DBs may not have singletonKey.
  if (!info) {
    info = await BusinessInfo.findOne().populate("logo");
    if (info && !info.singletonKey) {
      info.singletonKey = SINGLETON_KEY;
      await info.save();
    }
  }

  if (!info) {
    return {
      error: {
        statusCode: 404,
        message: "Business info not found",
      },
    };
  }

  return { data: info };
}

async function updateBusinessInfo({ data, userId }) {
  let info = await BusinessInfo.findOne({ singletonKey: SINGLETON_KEY });

  // Backward compatibility: older DBs may not have singletonKey.
  if (!info) {
    info = await BusinessInfo.findOne();
    if (info && !info.singletonKey) {
      info.singletonKey = SINGLETON_KEY;
    }
  }

  if (!info) {
    return {
      error: {
        statusCode: 404,
        message: "Business info not found",
      },
    };
  }

  const previousLogoId = info.logo ? String(info.logo) : null;
  const updates = { ...data };

  if (updates.logo === null || updates.logo === "") {
    info.logo = null;
    delete updates.logo;
  } else {
    const logoDataUrl =
      typeof updates.logo === "string"
        ? updates.logo
        : updates.logo?.dataUrl;
    const logoOriginalName =
      typeof updates.logo === "object"
        ? updates.logo?.originalName
        : undefined;

    if (logoDataUrl?.startsWith("data:image/")) {
      const temporaryFile = await base64ToTempFile(
        logoDataUrl,
        logoOriginalName,
      );

      if (temporaryFile.sizeBytes > BUSINESS_LOGO_MAX_BYTES) {
        await fs.unlink(temporaryFile.localPath).catch(() => {});
        return {
          error: {
            statusCode: 413,
            message: "Business logo must be 2 MB or smaller",
          },
        };
      }

      const uploaded = await uploadAndCreateFile({
        ...temporaryFile,
        uploadedBy: userId,
        folder: "litwebs/business",
      });

      if (!uploaded.success) {
        return {
          error: {
            statusCode: 500,
            message: uploaded.message || "Failed to upload business logo",
          },
        };
      }

      info.logo = uploaded.data._id;
      delete updates.logo;
    }
  }

  Object.assign(info, updates, { updatedBy: userId });
  await info.save();

  const nextLogoId = info.logo ? String(info.logo) : null;
  if (previousLogoId && previousLogoId !== nextLogoId) {
    await deleteFileIfOrphaned(previousLogoId);
  }

  await info.populate("logo");
  return { data: info };
}

module.exports = {
  getBusinessInfo,
  updateBusinessInfo,
};
