"use strict";

const mongoose = require("mongoose");
const Customer = require("../../models/customer.model");
const { Response } = require("../../utils/response.util");
const {
  DELIVERABLE_OUTWARD_CODES,
} = require("../../constants/deliveryCoverage.constants");
const { normalizePostcode } = require("../../utils/postcode.util");

const toClientAddress = (address) => {
  const plain =
    address && address.toObject ? address.toObject() : { ...address };
  const id = plain?._id ? String(plain._id) : null;
  return {
    ...plain,
    id,
  };
};

const ensureAddressIds = (customer) => {
  let changed = false;

  const normalizedAddresses = (customer.addresses || []).map((address) => {
    const plain =
      address && address.toObject ? address.toObject() : { ...address };
    if (plain && plain._id) return plain;

    changed = true;
    return {
      ...plain,
      _id: new mongoose.Types.ObjectId(),
    };
  });

  if (changed) {
    customer.addresses = normalizedAddresses;
    customer.markModified("addresses");
  }

  return changed;
};

const normalizeId = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const getAddressIndexById = (customer, addressId) => {
  const target = normalizeId(addressId);
  if (!target) return -1;

  return customer.addresses.findIndex((address) => {
    const subId = normalizeId(address?._id);
    const virtualId = normalizeId(address?.id);
    return subId === target || virtualId === target;
  });
};

const validateDeliverablePostcode = (postcode) => {
  const parsed = normalizePostcode(postcode);
  if (
    !parsed.outwardCode ||
    !DELIVERABLE_OUTWARD_CODES.has(parsed.outwardCode)
  ) {
    return Response(
      false,
      "We do not currently deliver to that postcode.",
      null,
    );
  }

  return {
    ok: true,
    formatted:
      parsed.formatted || parsed.normalized || String(postcode || "").trim(),
  };
};

/**
 * Get all addresses for a customer.
 */
async function ListAddresses({ customerId } = {}) {
  const customer = await Customer.findById(customerId).select("addresses");
  if (!customer) return Response(false, "Customer not found", null);

  if (ensureAddressIds(customer)) {
    await customer.save();
  }

  return Response(true, null, {
    addresses: (customer.addresses || []).map(toClientAddress),
  });
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

  const postcodeCheck = validateDeliverablePostcode(postcode);
  if (!postcodeCheck.ok) return postcodeCheck;

  if (ensureAddressIds(customer)) {
    await customer.save();
  }

  // Enforce 10 address limit per customer
  const ADDRESS_LIMIT = 10;
  if (customer.addresses.length >= ADDRESS_LIMIT) {
    return Response(
      false,
      `Maximum ${ADDRESS_LIMIT} addresses allowed per account`,
      null,
    );
  }

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
    postcode: postcodeCheck.formatted,
    country,
    deliveryInstructions: deliveryInstructions || null,
    isDefault,
  });

  await customer.save();

  const newAddress = customer.addresses[customer.addresses.length - 1];
  return Response(true, "Address added", {
    address: toClientAddress(newAddress),
  });
}

/**
 * Update an existing address.
 */
async function UpdateAddress({ customerId, addressId, ...fields } = {}) {
  const customer = await Customer.findById(customerId);
  if (!customer) return Response(false, "Customer not found", null);

  if (fields.postcode !== undefined) {
    const postcodeCheck = validateDeliverablePostcode(fields.postcode);
    if (!postcodeCheck.ok) return postcodeCheck;
    fields.postcode = postcodeCheck.formatted;
  }

  if (ensureAddressIds(customer)) {
    await customer.save();
  }

  const addressIndex = getAddressIndexById(customer, addressId);
  if (addressIndex < 0) return Response(false, "Address not found", null);
  const address = customer.addresses[addressIndex];

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
  return Response(true, "Address updated", {
    address: toClientAddress(address),
  });
}

/**
 * Delete an address.
 */
async function DeleteAddress({ customerId, addressId } = {}) {
  const customer = await Customer.findById(customerId);
  if (!customer) return Response(false, "Customer not found", null);

  if (ensureAddressIds(customer)) {
    await customer.save();
  }

  const addressIndex = getAddressIndexById(customer, addressId);
  if (addressIndex < 0) return Response(false, "Address not found", null);

  const [removedAddress] = customer.addresses.splice(addressIndex, 1);
  const wasDefault = Boolean(removedAddress?.isDefault);

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

  if (ensureAddressIds(customer)) {
    await customer.save();
  }

  const addressIndex = getAddressIndexById(customer, addressId);
  if (addressIndex < 0) return Response(false, "Address not found", null);

  customer.addresses.forEach((a) => {
    a.isDefault = false;
  });
  const address = customer.addresses[addressIndex];
  address.isDefault = true;

  await customer.save();
  return Response(true, "Default address updated", {
    address: toClientAddress(address),
  });
}

module.exports = {
  ListAddresses,
  AddAddress,
  UpdateAddress,
  DeleteAddress,
  SetDefaultAddress,
};
