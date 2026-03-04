import { describe, expect, it } from 'vitest'
import {
  parseSlackActionValue,
  resolveSlackInteractionLeadId,
} from '@/lib/slack/resolve-interaction-context'

describe('parseSlackActionValue', () => {
  it('parses structured JSON values', () => {
    const parsed = parseSlackActionValue(JSON.stringify({ tenantId: 'tenant-123', leadId: 'lead-123' }))

    expect(parsed.tenantId).toBe('tenant-123')
    expect(parsed.leadId).toBe('lead-123')
  })

  it('supports legacy raw lead IDs', () => {
    const parsed = parseSlackActionValue('lead-legacy')

    expect(resolveSlackInteractionLeadId(parsed)).toBe('lead-legacy')
    expect(parsed.raw).toBe('lead-legacy')
  })
})
