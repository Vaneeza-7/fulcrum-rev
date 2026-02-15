import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry } from '@/lib/retry';

vi.mock('@/lib/logger', () => ({
  jobLogger: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('withRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should succeed on first try without retries', async () => {
    const mockFn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(mockFn, 'test-context', {
      baseDelayMs: 1,
    });

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should fail then succeed on second try', async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce('success');

    const result = await withRetry(mockFn, 'test-context', {
      baseDelayMs: 1,
    });

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should give up after maxAttempts', async () => {
    const mockFn = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));

    await expect(
      withRetry(mockFn, 'test-context', {
        maxAttempts: 3,
        baseDelayMs: 1,
      })
    ).rejects.toThrow('ETIMEDOUT');

    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should NOT retry non-retryable errors', async () => {
    const mockFn = vi.fn().mockRejectedValue(new Error('Invalid API key'));

    await expect(
      withRetry(mockFn, 'test-context', {
        baseDelayMs: 1,
      })
    ).rejects.toThrow('Invalid API key');

    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable errors', async () => {
    const testCases = [
      { error: new Error('ECONNRESET'), name: 'ECONNRESET' },
      { error: new Error('429 rate limit'), name: '429' },
      { error: new Error('overloaded_error'), name: 'overloaded' },
      { error: new Error('503 service unavailable'), name: '503' },
      { error: new Error('socket hang up'), name: 'socket hang up' },
      { error: new Error('fetch failed'), name: 'fetch failed' },
      {
        error: Object.assign(new Error('Network error'), { code: 'ECONNRESET' }),
        name: 'error with code'
      },
      {
        error: Object.assign(new Error('Rate limited'), { status: 429 }),
        name: 'error with status'
      },
    ];

    for (const testCase of testCases) {
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(testCase.error)
        .mockResolvedValueOnce('success');

      const result = await withRetry(mockFn, `test-${testCase.name}`, {
        baseDelayMs: 1,
      });

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);

      vi.clearAllMocks();
    }
  });
});
