// Services/Templates/Templates.js
const resetPassword = require("./resetPassword");
const verifyEmailChange = require("./verifyEmailChange");
const emailChanged = require("./emailChanged");
const login2FA = require("./login2FA");
const submissionReply = require("./submissionReply");
const lowStockAlert = require("./lowStockAlert");
const newOrderAlert = require("./newOrderAlert");
const orderConfirmation = require("./orderConfirmation");
const outOfStockAlert = require("./outOfStockAlert");
const refundConfirmation = require("./refundConfirmation");
const userInvitation = require("./userInvitation");

const emailTemplates = {
  resetPassword,
  verifyEmailChange,
  emailChanged,
  login2FA,
  submissionReply,
  lowStockAlert,
  newOrderAlert,
  outOfStockAlert,
  orderConfirmation,
  refundConfirmation,
  userInvitation,
};

module.exports = emailTemplates;
