"use strict";

const express = require("express");
const asyncHandler = require("../../utils/asyncHandler.util");
const {
  requireCustomerAuth,
} = require("../../middleware/customerAuth.middleware");
const {
  validateBody,
  validateParams,
} = require("../../middleware/validate.middleware");

const controller = require("../../controllers/portal/customerAddresses.controller");
const {
  createAddressSchema,
  updateAddressSchema,
  addressIdParamSchema,
} = require("../../validators/portal.validators");

const router = express.Router();

router.use(requireCustomerAuth);

router.get("/", asyncHandler(controller.ListAddresses));

router.post(
  "/",
  validateBody(createAddressSchema),
  asyncHandler(controller.AddAddress),
);

router.patch(
  "/:addressId",
  validateParams(addressIdParamSchema),
  validateBody(updateAddressSchema),
  asyncHandler(controller.UpdateAddress),
);

router.delete(
  "/:addressId",
  validateParams(addressIdParamSchema),
  asyncHandler(controller.DeleteAddress),
);

router.post(
  "/:addressId/default",
  validateParams(addressIdParamSchema),
  asyncHandler(controller.SetDefaultAddress),
);

module.exports = router;
