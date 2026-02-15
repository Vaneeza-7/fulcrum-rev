import { jobLogger } from './logger';

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
};

/** Error messages/codes that are safe to retry. */
const RETRYABLE_PATTERNS = [
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'rate_limit',
  'overloaded',
  'overloaded_error',
  '529',  // Anthropic overloaded
  '429',  // Rate limited
  '503',  // Service unavailable
  'socket hang up',
  'fetch failed',
];

function isRetryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string })?.code;
  const status = (error as { status?: number })?.status;

  if (code && RETRYABLE_PATTERNS.includes(code)) return true;
  if (status && RETRYABLE_PATTERNS.includes(String(status))) return true;
  return RETRYABLE_PATTERNS.some((p) => message.includes(p));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with exponential backoff retry.
 * Only retries on transient errors (network, rate limits, overload).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
  options?: RetryOptions
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs } = { ...DEFAULT_OPTIONS, ...options };
  const log = jobLogger('retry');

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts || !isRetryable(error)) {
        throw error;
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      log.warn(
        { context, attempt, maxAttempts, delayMs: delay, err: error },
        `Retrying after transient error`
      );
      await sleep(delay);
    }
  }

  throw lastError;
}
