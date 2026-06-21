"use strict";

const Customer = require("../../models/customer.model");
const { Response } = require("../../utils/response.util");

/**
 * Get all addresses for a customer.
 */
async function ListAddresses({ customerId } = {}) {
  const customer = await Customer.findById(customerId)
    .select("addresses")
    .lean();
  if (!customer) return Response(false, "Customer not found", null);
  return Response(true, null, { addresses: customer.addresses || [] });
}

/**
 * Add a new address.
 */
async function AddAddress({
  customerId,
  label,
  fullName,
  phone,
  line1,
  line2,
  city,
  postcode,
  country,
  deliveryInstructions,
  isDefault = false,
} = {}) {
  const customer = await Customer.findById(customerId);
  if (!customer) return Response(false, "Customer not found", null);

  // If new address is default, un-default existing ones
  if (isDefault || customer.addresses.length === 0) {
    customer.addresses.forEach((a) => {
      a.isDefault = false;
    });
    isDefault = true;
  }

  customer.addresses.push({
    label: label || null,
    fullName: fullName || null,
    phone: phone || null,
    line1,
    line2: line2 || null,
    city,
    postcode,
    country,
    deliveryInstructions: deliveryInstructions || null,
    isDefault,
  });

  await customer.save();

  const newAddress = customer.addresses[customer.addresses.length - 1];
  return Response(true, "Address added", { address: newAddress });
}

/**
 * Update an existing address.
 */
async function UpdateAddress({ customerId, addressId, ...fields } = {}) {
  const customer = await Customer.findById(customerId);
  if (!customer) return Response(false, "Customer not found", null);

  const address = customer.addresses.id(addressId);
  if (!address) return Response(false, "Address not found", null);

  const allowedFields = [
    "label",
    "fullName",
    "phone",
    "line1",
    "line2",
    "city",
    "postcode",
    "country",
    "deliveryInstructions",
    "isDefault",
  ];

  // If making this address default, un-default others
  if (fields.isDefault === true) {
    customer.addresses.forEach((a) => {
      a.isDefault = false;
    });
  }

  for (const key of allowedFields) {
    if (fields[key] !== undefined) {
      address[key] = fields[key];
    }
  }

  await customer.save();
  return Response(true, "Address updated", { address });
}

/**
 * Delete an address.
 */
async function DeleteAddress({ customerId, addressId } = {}) {
  const customer = await Customer.findById(customerId);
  if (!customer) return Response(false, "Customer not found", null);

  const address = customer.addresses.id(addressId);
  if (!address) return Response(false, "Address not found", null);

  const wasDefault = address.isDefault;
  address.deleteOne();

  // Reassign default if needed
  if (wasDefault && customer.addresses.length > 0) {
    customer.addresses[0].isDefault = true;
  }

  await customer.save();
  return Response(true, "Address deleted", null);
}

/**
 * Set an address as default.
 */
async function SetDefaultAddress({ customerId, addressId } = {}) {
  const customer = await Customer.findById(customerId);
  if (!customer) return Response(false, "Customer not found", null);

  const address = customer.addresses.id(addressId);
  if (!address) return Response(false, "Address not found", null);

  customer.addresses.forEach((a) => {
    a.isDefault = false;
  });
  address.isDefault = true;

  await customer.save();
  return Response(true, "Default address updated", { address });
}

module.exports = {
  ListAddresses,
  AddAddress,
  UpdateAddress,
  DeleteAddress,
  SetDefaultAddress,
};
