// src/config/cloudinary.js
const { cloudName, apiKey, apiSecret } = require("./env").cloudinary;
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
});

const unavailable = async () => {
  const error = new Error("Image uploads are disabled in isolated UAT");
  error.statusCode = 503;
  throw error;
};

module.exports = process.env.APP_ENV === "uat"
  ? (process.env.UAT_STORAGE_MODE === "cloudinary"
      ? require("../utils/uatCloudinary").createUatCloudinary(cloudinary)
      : { uploader: { upload: unavailable, destroy: unavailable }, api: { delete_resources: unavailable } })
  : cloudinary;
