const BusinessInfo = require("../models/businessInfo.model");

const SINGLETON_KEY = "business-info";

async function getBusinessInfo() {
  let info = await BusinessInfo.findOne({ singletonKey: SINGLETON_KEY });

  // Backward compatibility: older DBs may not have singletonKey.
  if (!info) {
    info = await BusinessInfo.findOne();
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

  Object.assign(info, data, { updatedBy: userId });
  await info.save();

  return { data: info };
}

module.exports = {
  getBusinessInfo,
  updateBusinessInfo,
};
