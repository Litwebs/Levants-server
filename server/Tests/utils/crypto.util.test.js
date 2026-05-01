const {
  hashToken,
  encryptCredentialSecrets,
  decryptCredentialSecrets,
} = require("../../utils/crypto.util");

// ---------------------------------------------------------------------------
// hashToken
// ---------------------------------------------------------------------------
describe("hashToken", () => {
  test("returns a 64-char hex string", () => {
    const hash = hashToken("my-reset-token");
    expect(typeof hash).toBe("string");
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  test("is deterministic", () => {
    const token = "same-token-every-time";
    expect(hashToken(token)).toBe(hashToken(token));
  });

  test("different inputs produce different hashes", () => {
    expect(hashToken("token-a")).not.toBe(hashToken("token-b"));
  });

  test("coerces non-string to string before hashing", () => {
    const h = hashToken(12345);
    expect(h).toHaveLength(64);
    expect(h).toBe(hashToken("12345"));
  });

  test("handles null/undefined without throwing", () => {
    expect(() => hashToken(null)).not.toThrow();
    expect(() => hashToken(undefined)).not.toThrow();
    // null ?? "" → "", so hashToken(null) === hashToken("")
    expect(hashToken(null)).toBe(hashToken(""));
    // undefined ?? "" → "", same coercion
    expect(hashToken(undefined)).toBe(hashToken(""));
  });
});

// ---------------------------------------------------------------------------
// encryptCredentialSecrets / decryptCredentialSecrets round-trip
// ---------------------------------------------------------------------------
describe("encryptCredentialSecrets + decryptCredentialSecrets", () => {
  test("round-trips a plain password string", async () => {
    const raw = "super-secret-password";
    const encrypted = await encryptCredentialSecrets({ password: raw });

    expect(encrypted.encryptedPassword).not.toBeNull();
    expect(encrypted.encryptedPassword.ciphertext).toBeDefined();

    const decrypted = await decryptCredentialSecrets(encrypted);
    expect(decrypted.password).toBe(raw);
  });

  test("round-trips an extra object", async () => {
    const extra = { apiKey: "abc", region: "eu-west" };
    const encrypted = await encryptCredentialSecrets({ extra });
    const decrypted = await decryptCredentialSecrets(encrypted);

    expect(decrypted.extra).toEqual(extra);
  });

  test("round-trips both password and extra together", async () => {
    const raw = { password: "pass123", extra: { token: "xyz" } };
    const encrypted = await encryptCredentialSecrets(raw);
    const decrypted = await decryptCredentialSecrets(encrypted);

    expect(decrypted.password).toBe(raw.password);
    expect(decrypted.extra).toEqual(raw.extra);
  });

  test("clears encryptedPassword when password is null", async () => {
    // First encrypt something
    const initial = await encryptCredentialSecrets({ password: "initial" });
    // Then clear it
    const cleared = await encryptCredentialSecrets({
      password: null,
      existing: initial,
    });

    expect(cleared.encryptedPassword).toBeNull();
  });

  test("clears encryptedPassword when password is empty string", async () => {
    const initial = await encryptCredentialSecrets({ password: "initial" });
    const cleared = await encryptCredentialSecrets({
      password: "",
      existing: initial,
    });

    expect(cleared.encryptedPassword).toBeNull();
  });

  test("preserves existing encryptedPassword when password is undefined", async () => {
    const initial = await encryptCredentialSecrets({ password: "keep-me" });
    const updated = await encryptCredentialSecrets({
      extra: { foo: "bar" },
      existing: initial,
    });

    expect(updated.encryptedPassword).toEqual(initial.encryptedPassword);
  });

  test("clears encryptedExtra when extra is null", async () => {
    const initial = await encryptCredentialSecrets({
      extra: { key: "remove" },
    });
    const cleared = await encryptCredentialSecrets({
      extra: null,
      existing: initial,
    });

    expect(cleared.encryptedExtra).toBeNull();
  });

  test("includes encryptionMeta with version and algorithm", async () => {
    const result = await encryptCredentialSecrets({ password: "test" });
    expect(result.encryptionMeta.version).toBe(1);
    expect(result.encryptionMeta.algorithm).toBe("aes-256-gcm");
    expect(result.encryptionMeta.keyId).toBe("default");
    expect(result.encryptionMeta.updatedAt).toBeDefined();
  });

  test("decrypts returns empty object when nothing is encrypted", async () => {
    const result = await decryptCredentialSecrets({});
    expect(result).toEqual({});
  });

  test("decrypts returns null password on corrupt ciphertext", async () => {
    const result = await decryptCredentialSecrets({
      encryptedPassword: {
        ciphertext: "bm90dmFsaWQ=", // invalid ciphertext
        iv: Buffer.alloc(12).toString("base64"),
        authTag: Buffer.alloc(16).toString("base64"),
      },
    });
    // Should not throw; should return null
    expect(result.password).toBeNull();
  });

  test("encrypts produce unique IVs on each call (no IV reuse)", async () => {
    const a = await encryptCredentialSecrets({ password: "same" });
    const b = await encryptCredentialSecrets({ password: "same" });
    expect(a.encryptedPassword.iv).not.toBe(b.encryptedPassword.iv);
    // But both must still decrypt correctly
    const da = await decryptCredentialSecrets(a);
    const db = await decryptCredentialSecrets(b);
    expect(da.password).toBe("same");
    expect(db.password).toBe("same");
  });
});
