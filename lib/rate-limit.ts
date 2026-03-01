/**
 * In-memory sliding window rate limiter.
 * Note: On Vercel serverless, each function invocation may get a fresh instance,
 * so this only protects against burst abuse within warm invocations.
 * For production-grade rate limiting, upgrade to @upstash/ratelimit with Vercel KV.
 */

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const store = new Map<string, number[]>();

// Cleanup old entries every 60 seconds (unref so it doesn't keep serverless functions alive)
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of Array.from(store.entries())) {
    const filtered = timestamps.filter((t: number) => now - t < 300_000); // Keep last 5 min
    if (filtered.length === 0) {
      store.delete(key);
    } else {
      store.set(key, filtered);
    }
  }
}, 60_000);
if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
  cleanupTimer.unref();
}

/**
 * Check if a request should be rate limited.
 * Returns { limited: false } if allowed, or { limited: true, retryAfterMs } if exceeded.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { limited: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  let timestamps = store.get(key) ?? [];
  timestamps = timestamps.filter((t) => t > windowStart);

  if (timestamps.length >= config.maxRequests) {
    const oldestInWindow = timestamps[0];
    const retryAfterMs = oldestInWindow + config.windowMs - now;
    return { limited: true, retryAfterMs: Math.max(retryAfterMs, 0) };
  }

  timestamps.push(now);
  store.set(key, timestamps);
  return { limited: false };
}

/** Predefined rate limits. */
export const RATE_LIMITS = {
  slackEvents: { windowMs: 60_000, maxRequests: 100 } as RateLimitConfig,
  cronEndpoints: { windowMs: 60_000, maxRequests: 5 } as RateLimitConfig,
};
