const BusinessInfo = require("../models/businessInfo.model");

async function getBusinessInfo() {
  const info = await BusinessInfo.findOne();

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
  const info = await BusinessInfo.findOne();

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
