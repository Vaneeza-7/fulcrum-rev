import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, encryptJson, decryptJson } from '@/lib/crypto';

describe('Crypto', () => {
  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt a string successfully (roundtrip)', () => {
      const plaintext = 'This is a secret message!';
      const encryptionKey = 'my-super-secret-passphrase';

      const encrypted = encrypt(plaintext, encryptionKey);
      const decrypted = decrypt(encrypted, encryptionKey);

      expect(decrypted).toBe(plaintext);
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.length).toBeGreaterThan(0);
    });

    it('should encrypt and decrypt JSON data successfully (roundtrip)', () => {
      const data = {
        userId: '12345',
        email: 'user@example.com',
        apiKey: 'sk_test_abc123',
        metadata: {
          plan: 'premium',
          credits: 1000,
        },
      };
      const encryptionKey = 'another-secret-key';

      const encrypted = encryptJson(data, encryptionKey);
      const decrypted = decryptJson<typeof data>(encrypted, encryptionKey);

      expect(decrypted).toEqual(data);
      expect(decrypted.userId).toBe('12345');
      expect(decrypted.email).toBe('user@example.com');
      expect(decrypted.metadata.plan).toBe('premium');
      expect(decrypted.metadata.credits).toBe(1000);
    });

    it('should produce different ciphertext with different keys', () => {
      const plaintext = 'Same message, different keys';
      const key1 = 'first-key';
      const key2 = 'second-key';

      const encrypted1 = encrypt(plaintext, key1);
      const encrypted2 = encrypt(plaintext, key2);

      // Different keys should produce different ciphertext
      expect(encrypted1).not.toBe(encrypted2);

      // Each should decrypt correctly with its own key
      expect(decrypt(encrypted1, key1)).toBe(plaintext);
      expect(decrypt(encrypted2, key2)).toBe(plaintext);

      // Decrypting with wrong key should throw (test one direction only to save time)
      expect(() => decrypt(encrypted1, key2)).toThrow();
    }, 15000);

    it('should detect tampering and throw error', () => {
      const plaintext = 'Important data';
      const encryptionKey = 'secure-key';

      const encrypted = encrypt(plaintext, encryptionKey);

      // Tamper with the encrypted data by modifying a character
      const tamperedData = encrypted.slice(0, -5) + 'XXXXX';

      // Decryption should fail due to auth tag verification
      expect(() => decrypt(tamperedData, encryptionKey)).toThrow();
    });
  });
});
