import { describe, expect, it } from 'vitest'
import { shouldFallbackToApify } from '@/lib/discovery/service'

describe('shouldFallbackToApify', () => {
  it('falls back on transient provider failures', () => {
    expect(shouldFallbackToApify(new Error('Instantly request failed with 503'))).toBe(true)
    expect(shouldFallbackToApify(new Error('network timeout while reaching Instantly'))).toBe(true)
  })

  it('does not fall back on non-retriable unknown errors', () => {
    expect(shouldFallbackToApify(new Error('query translation bug'))).toBe(false)
  })
})
