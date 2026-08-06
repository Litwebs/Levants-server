"use strict";

const HOST = "127.0.0.1";
const API_PORT = 5011;
const CONTROL_PORT = 5012;
const CLIENT_PORT = 4173;
// sthis =

module.exports = Object.freeze({
  HOST,
  API_PORT,
  CONTROL_PORT,
  CLIENT_PORT,
  API_ORIGIN: `http://${HOST}:${API_PORT}`,
  CONTROL_ORIGIN: `http://${HOST}:${CONTROL_PORT}`,
  CLIENT_ORIGIN: `http://${HOST}:${CLIENT_PORT}`,
  CONTROL_TOKEN: "levants-local-real-stripe-e2e",
});
