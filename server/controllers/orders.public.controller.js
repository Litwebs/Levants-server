const service = require("../services/orders/orders.public.service");
const checkoutService = require("../services/orders/orders.webhook.service");
const { sendOk, sendErr } = require("../utils/response.util");

const CreateOrder = async (req, res) => {
  const result = await service.CreateOrder({
    customerId: req.body.customerId,
    items: req.body.items,
    discountCode: req.body.discountCode,
    creditToApplyMinor: req.body.creditToApplyMinor,
    deliveryAddress: req.body.deliveryAddress,
    deliveryDate: req.body.deliveryDate,
    customerInstructions: req.body.customerInstructions,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: 400,
      message: result.message,
    });
  }

  return sendOk(res, result.data);
};

const ConfirmCheckout = async (req, res) => {
  const result = await checkoutService.ReconcileCheckoutSession({
    checkoutSessionId: req.body.checkoutSessionId,
  });

  if (!result.success) {
    const statusCode =
      result.message === "Payment is not complete" ? 409 : 400;
    return sendErr(res, { statusCode, message: result.message });
  }

  return sendOk(res, result.data, { message: "Order confirmed" });
};

module.exports = {
  CreateOrder,
  ConfirmCheckout,
};
