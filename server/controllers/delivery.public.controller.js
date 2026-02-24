const { sendOk, sendErr } = require("../utils/response.util");
const {
  DELIVERABLE_OUTWARD_CODES,
} = require("../constants/deliveryCoverage.constants");
const { normalizePostcode } = require("../utils/postcode.util");

async function checkDeliveryPostcode(req, res) {
  const postcode = req?.body?.postcode ?? req?.query?.postcode;

  if (typeof postcode !== "string" || postcode.trim().length < 2) {
    return sendErr(res, {
      statusCode: 400,
      message: "postcode is required in request body",
    });
  }

  const parsed = normalizePostcode(postcode);
  const deliverable =
    parsed.outwardCode && DELIVERABLE_OUTWARD_CODES.has(parsed.outwardCode);

  return sendOk(res, {
    postcode: parsed.input,
    normalized: parsed.normalized,
    formatted: parsed.formatted,
    outwardCode: parsed.outwardCode,
    deliverable,
    matchedOutwardCode: deliverable ? parsed.outwardCode : null,
  });
}

module.exports = {
  checkDeliveryPostcode,
};
