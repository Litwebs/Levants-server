"use strict";
const { randomUUID } = require("node:crypto");
const PREFIX = "levants-uat/";
const scopeError = () => Object.assign(new Error("UAT cannot modify assets outside levants-uat/"), { statusCode: 403 });
function assertUatAsset(id) {
  if (typeof id !== "string" || !/^levants-uat\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(id)) throw scopeError();
}
function resourceType(options) {
  const type = options.resource_type || "image";
  if (!["image", "video", "raw", "auto"].includes(type)) throw new Error("Invalid UAT resource type");
  return type;
}
function createUatCloudinary(provider) {
  return {
    uploader: {
      async upload(file, options = {}) {
        const folder = options.folder || "files";
        if (typeof folder !== "string" || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(folder)) throw scopeError();
        const scopedFolder = PREFIX + folder;
        const id = randomUUID();
        // `folder` preserves both public-ID and asset-folder paths in fixed and
        // dynamic Cloudinary environments. Caller-supplied IDs/presets/credentials
        // are deliberately excluded. Never overwrite an existing asset.
        const result = await provider.uploader.upload(file, {
          folder: scopedFolder, public_id: id, overwrite: false,
          use_filename: false, unique_filename: false, type: "upload",
          resource_type: resourceType(options),
        });
        if (result.public_id !== `${scopedFolder}/${id}`) throw new Error("Cloudinary returned an unexpected UAT asset path");
        return result;
      },
      async destroy(id, options = {}) {
        assertUatAsset(id);
        return provider.uploader.destroy(id, { resource_type: resourceType(options), type: "upload", invalidate: true });
      },
    },
    api: {
      async delete_resources(ids, options = {}) {
        if (!Array.isArray(ids) || !ids.length || ids.length > 100) throw scopeError();
        ids.forEach(assertUatAsset);
        return provider.api.delete_resources(ids, { resource_type: resourceType(options), type: "upload", invalidate: true });
      },
    },
  };
}
module.exports = { createUatCloudinary, assertUatAsset };
