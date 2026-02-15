import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 100_000;

/**
 * Derive a 256-bit encryption key from a passphrase using PBKDF2.
 */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string containing: salt + iv + authTag + ciphertext.
 */
export function encrypt(plaintext: string, encryptionKey: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(encryptionKey, salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack: salt(32) + iv(16) + authTag(16) + ciphertext
  const packed = Buffer.concat([salt, iv, authTag, encrypted]);
  return packed.toString('base64');
}

/**
 * Decrypt a base64-encoded ciphertext produced by encrypt().
 * Throws if the key is wrong or data has been tampered with.
 */
export function decrypt(encryptedBase64: string, encryptionKey: string): string {
  const packed = Buffer.from(encryptedBase64, 'base64');

  if (packed.length < SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Invalid encrypted data: too short');
  }

  const salt = packed.subarray(0, SALT_LENGTH);
  const iv = packed.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = packed.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  const key = deriveKey(encryptionKey, salt);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Encrypt a JSON-serializable object. Returns a base64 string.
 */
export function encryptJson(data: unknown, encryptionKey: string): string {
  return encrypt(JSON.stringify(data), encryptionKey);
}

/**
 * Decrypt a base64 string back to a parsed JSON object.
 */
export function decryptJson<T = unknown>(encryptedBase64: string, encryptionKey: string): T {
  return JSON.parse(decrypt(encryptedBase64, encryptionKey)) as T;
}
