"use strict";

const service = require("../../services/customerPortal/customerAuth.service");
const { sendOk, sendCreated, sendErr } = require("../../utils/response.util");

const { PORTAL_COOKIE_NAME, PORTAL_REFRESH_COOKIE_NAME, buildCookieOptions } =
  service;

const Register = async (req, res) => {
  const result = await service.Register(req.body);
  if (!result.success)
    return sendErr(res, { statusCode: 409, message: result.message });
  return sendCreated(res, result.data, { message: result.message });
};

const Login = async (req, res) => {
  const { rememberMe = false } = req.body || {};
  const result = await service.Login({
    ...req.body,
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });

  if (!result.success)
    return sendErr(res, { statusCode: 401, message: result.message });

  const { accessToken, refreshToken, customer } = result.data;

  res.cookie(
    PORTAL_COOKIE_NAME,
    accessToken,
    buildCookieOptions({ rememberMe }),
  );
  res.cookie(
    PORTAL_REFRESH_COOKIE_NAME,
    refreshToken,
    buildCookieOptions({ rememberMe, refreshCookie: true }),
  );

  return sendOk(res, { customer, accessToken });
};

const Logout = async (req, res) => {
  const refreshToken =
    req.cookies?.[PORTAL_REFRESH_COOKIE_NAME] || req.body?.refreshToken;

  // Extract sessionId from refresh token if present
  let sessionId = null;
  try {
    const jwtUtil = require("../../utils/jwt.util");
    if (refreshToken) {
      const payload = jwtUtil.verifyCustomerRefreshToken(refreshToken);
      sessionId = payload.sid;
    }
  } catch {
    // ignore
  }

  await service.Logout({ sessionId });

  res.clearCookie(PORTAL_COOKIE_NAME);
  res.clearCookie(PORTAL_REFRESH_COOKIE_NAME);
  return sendOk(res, null, { message: "Logged out successfully" });
};

const RefreshToken = async (req, res) => {
  const refreshToken =
    req.cookies?.[PORTAL_REFRESH_COOKIE_NAME] || req.body?.refreshToken;

  const result = await service.RefreshToken({ refreshToken });
  if (!result.success) {
    res.clearCookie(PORTAL_COOKIE_NAME);
    res.clearCookie(PORTAL_REFRESH_COOKIE_NAME);
    return sendErr(res, { statusCode: 401, message: result.message });
  }

  const { accessToken, refreshToken: newRefreshToken } = result.data;

  res.cookie(PORTAL_COOKIE_NAME, accessToken, buildCookieOptions());
  res.cookie(
    PORTAL_REFRESH_COOKIE_NAME,
    newRefreshToken,
    buildCookieOptions({ refreshCookie: true }),
  );

  return sendOk(res, { accessToken });
};

const ForgotPassword = async (req, res) => {
  const result = await service.ForgotPassword(req.body);
  return sendOk(res, null, { message: result.message });
};

const ResetPassword = async (req, res) => {
  const result = await service.ResetPassword(req.body);
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, null, { message: result.message });
};

const GetMe = async (req, res) => {
  const result = await service.GetMe({ customerId: req.customer._id });
  if (!result.success)
    return sendErr(res, { statusCode: 404, message: result.message });
  return sendOk(res, result.data);
};

const UpdateProfile = async (req, res) => {
  const result = await service.UpdateProfile({
    customerId: req.customer._id,
    ...req.body,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 404, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const ChangePassword = async (req, res) => {
  const result = await service.ChangePassword({
    customerId: req.customer._id,
    ...req.body,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  res.clearCookie(PORTAL_COOKIE_NAME);
  res.clearCookie(PORTAL_REFRESH_COOKIE_NAME);
  return sendOk(res, null, { message: result.message });
};

module.exports = {
  Register,
  Login,
  Logout,
  RefreshToken,
  ForgotPassword,
  ResetPassword,
  GetMe,
  UpdateProfile,
  ChangePassword,
};
