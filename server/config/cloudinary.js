// src/config/cloudinary.js
const { cloudName, apiKey, apiSecret } = require("./env").cloudinary;
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
});

module.exports = cloudinary;
