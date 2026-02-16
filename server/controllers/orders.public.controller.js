const service = require("../services/orders.public.service");
const { sendOk, sendErr } = require("../utils/response.util");

const CreateOrder = async (req, res) => {
  const result = await service.CreateOrder({
    customerId: req.body.customerId,
    items: req.body.items,
    discountCode: req.body.discountCode,
    deliveryAddress: req.body.deliveryAddress,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: 400,
      message: result.message,
    });
  }

  return sendOk(res, result.data);
};

module.exports = {
  CreateOrder,
};
