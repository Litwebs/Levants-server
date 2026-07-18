"use strict";

const service = require("../../services/customerPortal/customerAddresses.service");
const { sendOk, sendCreated, sendErr } = require("../../utils/response.util");

const ListAddresses = async (req, res) => {
  const result = await service.ListAddresses({ customerId: req.customer._id });
  return sendOk(res, result.data);
};

const AddAddress = async (req, res) => {
  const result = await service.AddAddress({
    customerId: req.customer._id,
    ...req.body,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendCreated(res, result.data, { message: result.message });
};

const UpdateAddress = async (req, res) => {
  const result = await service.UpdateAddress({
    customerId: req.customer._id,
    addressId: req.params.addressId,
    ...req.body,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 404, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const DeleteAddress = async (req, res) => {
  const result = await service.DeleteAddress({
    customerId: req.customer._id,
    addressId: req.params.addressId,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 404, message: result.message });
  return sendOk(res, null, { message: result.message });
};

const SetDefaultAddress = async (req, res) => {
  const result = await service.SetDefaultAddress({
    customerId: req.customer._id,
    addressId: req.params.addressId,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 404, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

module.exports = {
  ListAddresses,
  AddAddress,
  UpdateAddress,
  DeleteAddress,
  SetDefaultAddress,
};
