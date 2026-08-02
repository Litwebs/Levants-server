"use strict";

const storeCreditService = require("../../services/storeCredit.service");
const { sendOk } = require("../../utils/response.util");

/**
 * Get the authenticated customer's store-credit balance + ledger history.
 */
const GetMyCredit = async (req, res) => {
  const customerId = req.customer._id;
  const page = Number(req.query.page) || 1;
  const pageSize = Number(req.query.pageSize) || 20;

  const [balance, ledger] = await Promise.all([
    storeCreditService.getBalance(customerId),
    storeCreditService.listTransactions({ customerId, page, pageSize }),
  ]);

  return sendOk(
    res,
    { balance, transactions: ledger.transactions },
    { meta: ledger.meta },
  );
};

module.exports = { GetMyCredit };
