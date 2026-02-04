// Services/Templates/Templates.js
const resetPassword = require("./resetPassword");
const verifyEmailChange = require("./verifyEmailChange");
const emailChanged = require("./emailChanged");
const login2FA = require("./login2FA");
const submissionReply = require("./submissionReply");

const emailTemplates = {
  resetPassword,
  verifyEmailChange,
  emailChanged,
  login2FA,
  submissionReply,
};

module.exports = emailTemplates;
