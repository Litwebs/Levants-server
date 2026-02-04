// src/utils/crypto.util.js
//
// General crypto helpers:
//  - hashToken: for password-reset tokens, etc.
//  - encryptCredentialSecrets / decryptCredentialSecrets:
//      used by credentials.service to store/reveal passwords + extras securely.

const crypto = require("crypto");

/**
 * Simple SHA-256 hash, hex output.
 * Used e.g. for password reset tokens so we never store raw tokens.
 */
function hashToken(token) {
  if (typeof token !== "string") {
    token = String(token ?? "");
  }

  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Master key for credentials encryption.
 *
 * In production you MUST set:
 *   CREDENTIALS_MASTER_KEY
 *
 * It should be 32 bytes of entropy, base64 or hex encoded.
 * Here we accept:
 *   - 64-char hex string => 32 bytes
 *   - 32-byte raw (will be padded/truncated)
 *
 * In dev, we fallback to a static key – change this for anything real.
 */
function getMasterKey() {
  const envKey = process.env.CREDENTIALS_MASTER_KEY;

  if (envKey) {
    // Try hex first
    if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
      return Buffer.from(envKey, "hex");
    }

    // Try base64
    try {
      const buf = Buffer.from(envKey, "base64");
      if (buf.length === 32) return buf;
    } catch (_) {
      // ignore, fallback below
    }

    // Fallback: hash whatever string was provided to 32 bytes.
    return crypto.createHash("sha256").update(envKey, "utf8").digest();
  }

  // Dev fallback (DO NOT use in real production).
  return crypto
    .createHash("sha256")
    .update("dev-credentials-master-key-change-me", "utf8")
    .digest();
}

const MASTER_KEY = getMasterKey();
const ALGORITHM = "aes-256-gcm";
const CURRENT_VERSION = 1;
const DEFAULT_KEY_ID = "default";

/**
 * Encrypt a JSON-serializable value.
 *
 * Returns:
 *  {
 *    ciphertext: base64,
 *    iv: base64,
 *    authTag: base64
 *  }
 */
function encryptJson(value) {
  const iv = crypto.randomBytes(12); // GCM 96-bit nonce
  const cipher = crypto.createCipheriv(ALGORITHM, MASTER_KEY, iv);

  const json = JSON.stringify(value ?? null);
  const encrypted = Buffer.concat([
    cipher.update(json, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/**
 * Decrypt a JSON-serializable value.
 *
 * @param {object} param0
 *  {
 *    ciphertext: base64,
 *    iv: base64,
 *    authTag: base64
 *  }
 */
function decryptJson({ ciphertext, iv, authTag }) {
  if (!ciphertext) return null;

  const ivBuf = Buffer.from(iv, "base64");
  const tagBuf = Buffer.from(authTag, "base64");
  const encBuf = Buffer.from(ciphertext, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, MASTER_KEY, ivBuf);
  decipher.setAuthTag(tagBuf);

  const decrypted = Buffer.concat([decipher.update(encBuf), decipher.final()]);

  const json = decrypted.toString("utf8");
  return JSON.parse(json);
}

/**
 * Encrypt credential secrets (password + extra object) for the Credential model.
 *
 * Args:
 *  {
 *    password?,              // raw string
 *    extra?,                 // object
 *    existing?: {
 *      encryptedPassword?,
 *      encryptedExtra?,
 *      encryptionMeta?
 *    }
 *  }
 *
 * Behaviour:
 *  - If password is undefined => keep existing encryptedPassword as-is
 *  - If password is null or empty string => clear encryptedPassword
 *  - Same logic for extra
 */
async function encryptCredentialSecrets({ password, extra, existing = {} }) {
  const result = {
    encryptedPassword: existing.encryptedPassword || null,
    encryptedExtra: existing.encryptedExtra || null,
    encryptionMeta: existing.encryptionMeta || {
      version: CURRENT_VERSION,
      algorithm: ALGORITHM,
      keyId: DEFAULT_KEY_ID,
      createdAt: new Date(),
    },
  };

  // Password
  if (typeof password !== "undefined") {
    if (password === null || password === "") {
      result.encryptedPassword = null;
    } else {
      const { ciphertext, iv, authTag } = encryptJson(String(password));
      result.encryptedPassword = {
        ciphertext,
        iv,
        authTag,
      };
    }
  }

  // Extra (object / map of secrets)
  if (typeof extra !== "undefined") {
    if (extra === null) {
      result.encryptedExtra = null;
    } else {
      const { ciphertext, iv, authTag } = encryptJson(extra);
      result.encryptedExtra = {
        ciphertext,
        iv,
        authTag,
      };
    }
  }

  // Update meta timestamp if anything changed
  result.encryptionMeta = {
    ...(existing.encryptionMeta || {}),
    version: CURRENT_VERSION,
    algorithm: ALGORITHM,
    keyId: DEFAULT_KEY_ID,
    updatedAt: new Date(),
  };

  return result;
}

/**
 * Decrypt credential secrets (password + extra) from the Credential model.
 *
 * Args:
 *  {
 *    encryptedPassword?,
 *    encryptedExtra?,
 *    encryptionMeta?
 *  }
 *
 * Returns:
 *  {
 *    password?: string | null,
 *    extra?: object | null
 *  }
 */
async function decryptCredentialSecrets({
  encryptedPassword,
  encryptedExtra,
  encryptionMeta, // currently unused, but kept for future key rotation logic
}) {
  const result = {};

  if (encryptedPassword && encryptedPassword.ciphertext) {
    try {
      result.password = decryptJson(encryptedPassword);
    } catch (err) {
      // In case of decrypt error, don't throw secrets into logs.
      if (process.env.NODE_ENV !== "test") {
        console.error("Failed to decrypt credential password", err.message);
      }
      result.password = null;
    }
  }

  if (encryptedExtra && encryptedExtra.ciphertext) {
    try {
      result.extra = decryptJson(encryptedExtra);
    } catch (err) {
      if (process.env.NODE_ENV !== "test") {
        console.error("Failed to decrypt credential extra", err.message);
      }
      result.extra = null;
    }
  }

  return result;
}

module.exports = {
  hashToken,
  encryptCredentialSecrets,
  decryptCredentialSecrets,
};
