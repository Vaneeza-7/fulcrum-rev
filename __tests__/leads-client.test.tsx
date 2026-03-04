import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
    React.createElement('a', { href, ...props }, children),
}))

import { LeadsClient, canRetryCrmPush } from '@/app/(dashboard)/leads/LeadsClient'

const baseLead = {
  id: 'lead-1',
  fullName: 'Jordan Example',
  title: 'VP Revenue',
  company: 'Acme',
  location: 'New York, NY',
  fulcrumScore: 92,
  fulcrumGrade: 'A+',
  fitScore: 35,
  intentScore: 57,
  status: 'approved',
  firstLine: 'You look like a strong fit.',
  linkedinUrl: 'https://linkedin.com/in/jordan',
  discoveredAt: '2026-03-04T15:00:00.000Z',
  pushedToCrmAt: null,
  crmLeadId: null,
  crmPushState: 'failed',
  crmPushAttempts: 2,
  crmPushLastError: 'CRM auth failed.',
  approvedAt: '2026-03-04T15:05:00.000Z',
  approvedBy: 'user-1',
}

const crmHealth = {
  level: 'RED' as const,
  queuedCount: 3,
  failedCount: 1,
  oldestQueuedMinutes: 18,
  duplicateRate30d: '1.00',
  paused: true,
  message: 'CRM push is paused for HubSpot.',
  action: 'Resume after fixing credentials.',
}

describe('LeadsClient', () => {
  it('renders CRM operator controls for a paused tenant', () => {
    const html = renderToStaticMarkup(
      <LeadsClient initialLeads={[baseLead]} crmType="hubspot" crmHealth={crmHealth} />,
    )

    expect(html).toContain('Resume CRM Push')
    expect(html).toContain('Retry Failed Pushes')
    expect(html).toContain('Fix CRM Settings')
  })

  it('renders per-lead CRM retry controls and review queue actions', () => {
    const html = renderToStaticMarkup(
      <LeadsClient
        initialLeads={[baseLead, { ...baseLead, id: 'lead-2', status: 'pending_review', crmPushState: 'not_queued' }]}
        crmType="hubspot"
        crmHealth={{ ...crmHealth, paused: false }}
      />,
    )

    expect(html).toContain('Review Queue Actions')
    expect(html).toContain('Approve Selected Grades')
    expect(canRetryCrmPush(baseLead)).toBe(true)
  })
})
