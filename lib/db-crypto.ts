import { encryptJson, decryptJson } from './crypto';

const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;

/**
 * Check if token encryption is enabled.
 * Falls back to plaintext if TOKEN_ENCRYPTION_KEY is not set (development).
 */
function isEncryptionEnabled(): boolean {
  return !!ENCRYPTION_KEY && ENCRYPTION_KEY.length >= 32;
}

/**
 * Encrypt a tenant config object for storage.
 * Returns the encrypted string, or the original object if encryption is disabled.
 */
export function encryptTenantConfig<T>(config: T): T | string {
  if (!isEncryptionEnabled()) return config;
  return encryptJson(config, ENCRYPTION_KEY!) as unknown as T | string;
}

/**
 * Decrypt a tenant config value read from the database.
 * Handles both encrypted strings and plaintext JSON objects (migration-friendly).
 */
export function decryptTenantConfig<T>(stored: T | string | null): T | null {
  if (stored === null || stored === undefined) return null;

  // If it's already an object, it's plaintext (not yet encrypted)
  if (typeof stored === 'object') return stored as T;

  // If it's a string, try to decrypt
  if (typeof stored === 'string' && isEncryptionEnabled()) {
    try {
      return decryptJson<T>(stored, ENCRYPTION_KEY!);
    } catch {
      // If decryption fails, it might be a JSON string (pre-encryption migration)
      try {
        return JSON.parse(stored) as T;
      } catch {
        return null;
      }
    }
  }

  // String but encryption not enabled — try parsing as JSON
  if (typeof stored === 'string') {
    try {
      return JSON.parse(stored) as T;
    } catch {
      return null;
    }
  }

  return null;
}
