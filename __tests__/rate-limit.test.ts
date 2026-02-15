import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit } from '@/lib/rate-limit';

describe('checkRateLimit', () => {
  const testKey = 'test-key';

  beforeEach(() => {
    // Clear the internal store by making requests until they expire
    // We use a unique key for each test to avoid conflicts
  });

  it('should allow first request', () => {
    const uniqueKey = `${testKey}-first-${Date.now()}`;
    const result = checkRateLimit(uniqueKey, {
      windowMs: 1000,
      maxRequests: 5,
    });

    expect(result.limited).toBe(false);
    expect(result.retryAfterMs).toBeUndefined();
  });

  it('should allow requests within limit', () => {
    const uniqueKey = `${testKey}-within-${Date.now()}`;
    const config = { windowMs: 1000, maxRequests: 10 };

    // Make 5 requests (well under the limit of 10)
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(uniqueKey, config);
      expect(result.limited).toBe(false);
    }
  });

  it('should return limited true when exceeding limit', () => {
    const uniqueKey = `${testKey}-exceed-${Date.now()}`;
    const config = { windowMs: 1000, maxRequests: 3 };

    // Make maxRequests (3) requests - all should succeed
    for (let i = 0; i < 3; i++) {
      const result = checkRateLimit(uniqueKey, config);
      expect(result.limited).toBe(false);
    }

    // The 4th request should be rate limited
    const result = checkRateLimit(uniqueKey, config);
    expect(result.limited).toBe(true);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(config.windowMs);
  });

  it('should allow new requests after window passes', async () => {
    const uniqueKey = `${testKey}-window-${Date.now()}`;
    const config = { windowMs: 100, maxRequests: 2 };

    // Make 2 requests (hit the limit)
    checkRateLimit(uniqueKey, config);
    checkRateLimit(uniqueKey, config);

    // 3rd request should be limited
    const limitedResult = checkRateLimit(uniqueKey, config);
    expect(limitedResult.limited).toBe(true);

    // Wait for the window to pass
    await new Promise((resolve) => setTimeout(resolve, 150));

    // After window passes, new requests should be allowed
    const allowedResult = checkRateLimit(uniqueKey, config);
    expect(allowedResult.limited).toBe(false);
  });
});
