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

import {
  LeadsClient,
  canRetryCrmPush,
  shouldLoadLeadCrmActivity,
} from '@/app/(dashboard)/leads/LeadsClient'

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
  oldestFailedMinutes: 22,
  duplicateRate30d: '1.00',
  paused: true,
  message: 'CRM push is paused for HubSpot.',
  action: 'Resume after fixing credentials.',
}

const crmActivitySummary = {
  window: '7d' as const,
  totals: {
    created: 4,
    duplicates: 1,
    authFailed: 1,
    validationFailed: 2,
    transientFailed: 0,
    matchedExisting: 0,
    other: 0,
  },
  duplicateRate: '20.00',
  oldestFailedMinutes: 31,
  topDuplicateLeads: [
    {
      leadId: 'lead-1',
      leadName: 'Jordan Example',
      company: 'Acme',
      duplicateCount: 1,
    },
  ],
  recentDuplicates: [
    {
      id: 'event-1',
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      leadName: 'Jordan Example',
      company: 'Acme',
      connector: 'hubspot',
      outcome: 'duplicate_detected' as const,
      rawOutcome: 'duplicate_detected',
      crmObjectId: 'hs-123',
      attemptNumber: 2,
      errorCode: 'duplicate_detected',
      errorMessage: 'Duplicate detected in the CRM.',
      createdAt: '2026-03-04T15:15:00.000Z',
      metadata: { source: 'cron' as const },
    },
  ],
}

const crmActivityFeed = {
  page: 1,
  pageSize: 25,
  total: 1,
  totalPages: 1,
  filters: {
    leadId: null,
    outcome: null,
    errorCode: null,
    window: '7d' as const,
    q: null,
  },
  events: [
    {
      id: 'event-1',
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      leadName: 'Jordan Example',
      company: 'Acme',
      connector: 'hubspot',
      outcome: 'duplicate_detected' as const,
      rawOutcome: 'duplicate_detected',
      crmObjectId: 'hs-123',
      attemptNumber: 2,
      errorCode: 'duplicate_detected',
      errorMessage: 'Duplicate detected in the CRM.',
      createdAt: '2026-03-04T15:15:00.000Z',
      metadata: { source: 'cron' as const },
    },
  ],
}

describe('LeadsClient', () => {
  it('renders CRM operator controls for a paused tenant', () => {
    const html = renderToStaticMarkup(
      <LeadsClient
        initialLeads={[baseLead]}
        crmType="hubspot"
        crmHealth={crmHealth}
        initialCrmActivitySummary={crmActivitySummary}
        initialCrmActivityFeed={crmActivityFeed}
      />,
    )

    expect(html).toContain('Resume CRM Push')
    expect(html).toContain('Retry Failed Pushes')
    expect(html).toContain('Fix CRM Settings')
    expect(html).toContain('CRM Activity')
    expect(html).toContain('Duplicate Diagnostics')
  })

  it('renders per-lead CRM retry controls and review queue actions', () => {
    const html = renderToStaticMarkup(
      <LeadsClient
        initialLeads={[baseLead, { ...baseLead, id: 'lead-2', status: 'pending_review', crmPushState: 'not_queued' }]}
        crmType="hubspot"
        crmHealth={{ ...crmHealth, paused: false }}
        initialCrmActivitySummary={crmActivitySummary}
        initialCrmActivityFeed={crmActivityFeed}
      />,
    )

    expect(html).toContain('Review Queue Actions')
    expect(html).toContain('Approve Selected Grades')
    expect(canRetryCrmPush(baseLead)).toBe(true)
    expect(shouldLoadLeadCrmActivity(baseLead)).toBe(true)
  })
})
