import crypto from "crypto";

const ALGO = "aes-256-gcm";
let KEY;

/**
 * Get a consistent encryption key from environment variable
 */
export function getEncryptionKey() {
  if (!KEY) {
    const secret = process.env.WA_SESSION_SECRET;
    if (!secret) throw new Error("WA_SESSION_SECRET is not defined in your environment!");
    KEY = crypto.createHash("sha256").update(secret).digest();
  }
  return KEY;
}

/**
 * Encrypt an object (session) into a string
 */
export function encrypt(data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getEncryptionKey(), iv);

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);

  return {
    iv: iv.toString("hex"),
    content: encrypted.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
}

/**
 * Decrypt a previously encrypted payload
 */
export function decrypt(payload) {
  const decipher = crypto.createDecipheriv(
    ALGO,
    getEncryptionKey(),
    Buffer.from(payload.iv, "hex")
  );

  decipher.setAuthTag(Buffer.from(payload.tag, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.content, "hex")),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8"));
}