import { describe, expect, it } from 'vitest'
import { addOneMonthUtc } from '@/lib/billing/manual-plans'

describe('addOneMonthUtc', () => {
  it('preserves UTC time of day across DST boundaries', () => {
    const start = new Date('2026-03-03T21:59:29.789Z')
    const result = addOneMonthUtc(start)

    expect(result.toISOString()).toBe('2026-04-03T21:59:29.789Z')
  })

  it('clamps the day to the last valid day in the next month', () => {
    const start = new Date('2026-01-31T12:30:15.000Z')
    const result = addOneMonthUtc(start)

    expect(result.toISOString()).toBe('2026-02-28T12:30:15.000Z')
  })
})
