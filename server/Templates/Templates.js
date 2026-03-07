// Services/Templates/Templates.js
const resetPassword = require("./resetPassword");
const verifyEmailChange = require("./verifyEmailChange");
const emailChanged = require("./emailChanged");
const login2FA = require("./login2FA");
const lowStockAlert = require("./lowStockAlert");
const newOrderAlert = require("./newOrderAlert");
const orderConfirmation = require("./orderConfirmation");
const deliveryProof = require("./deliveryProof");
const outOfStockAlert = require("./outOfStockAlert");
const refundConfirmation = require("./refundConfirmation");
const userInvitation = require("./userInvitation");

const emailTemplates = {
  resetPassword,
  verifyEmailChange,
  emailChanged,
  login2FA,
  lowStockAlert,
  newOrderAlert,
  outOfStockAlert,
  orderConfirmation,
  deliveryProof,
  refundConfirmation,
  userInvitation,
};

module.exports = emailTemplates;
