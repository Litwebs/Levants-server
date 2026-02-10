const service = require("../services/customers.service");
const { sendCreated, sendOk, sendErr } = require("../utils/response.util");

/**
 * Create or reuse customer (public / checkout)
 */
const CreateCustomer = async (req, res) => {
  const result = await service.FindOrCreateGuestCustomer(req.body || {});

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  if (result.statusCode === 201) {
    return sendCreated(res, result.data);
  }

  return sendOk(res, result.data);
};

/**
 * Create or reuse guest customer (public / checkout)
 */
const CreateGuestCustomer = async (req, res) => {
  const result = await service.FindOrCreateGuestCustomer(req.body || {});

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

/**
 * Get customer by ID (admin)
 */
const GetCustomerById = async (req, res) => {
  const result = await service.GetCustomerById({
    customerId: req.params.customerId,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 404,
      message: result.message,
    });
  }

  return sendOk(res, result.data);
};

/**
 * List customers (admin)
 */
const ListCustomers = async (req, res) => {
  const result = await service.ListCustomers({
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
    search: req.query.search,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data, { meta: result.meta });
};

/**
 * Update customer (admin)
 */
const UpdateCustomer = async (req, res) => {
  const result = await service.UpdateCustomer({
    customerId: req.params.customerId,
    body: req.body,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 404,
      message: result.message,
    });
  }

  return sendOk(res, result.data);
};

/**
 * List orders by customer (admin)
 */
const ListOrdersByCustomer = async (req, res) => {
  const result = await service.ListOrdersByCustomer({
    customerId: req.params.customerId,
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data, { meta: result.meta });
};

module.exports = {
  CreateCustomer,
  CreateGuestCustomer,
  GetCustomerById,
  ListCustomers,
  UpdateCustomer,
  ListOrdersByCustomer,
};
