const businessInfoService = require("../services/businessInfo.service");
const { sendOk } = require("../utils/response.util");

const GetBusinessInfo = async (req, res, next) => {
  const result = await businessInfoService.getBusinessInfo();

  if (result.error) {
    return next(result.error);
  }

  return sendOk(res, {
    business: result.data,
  });
};

const GetPublicBusinessInfo = async (req, res, next) => {
  const result = await businessInfoService.getBusinessInfo();

  if (result.error) {
    return next(result.error);
  }

  const business = result.data;
  return sendOk(res, {
    business: {
      companyName: business.companyName,
      email: business.email,
      phone: business.phone || "",
      address: business.address || "",
      logo: business.logo?.url ? { url: business.logo.url } : null,
    },
  });
};

const UpdateBusinessInfo = async (req, res, next) => {
  const result = await businessInfoService.updateBusinessInfo({
    data: req.body,
    userId: req.user.id,
  });

  if (result.error) {
    return next(result.error);
  }

  return sendOk(res, {
    business: result.data,
  });
};

module.exports = {
  GetBusinessInfo,
  GetPublicBusinessInfo,
  UpdateBusinessInfo,
};
