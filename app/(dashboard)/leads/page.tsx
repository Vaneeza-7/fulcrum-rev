import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getTenantCrmPushEventSummary, listTenantCrmPushEvents } from '@/lib/crm/push-events-service'
import { LeadsClient } from './LeadsClient'
import { getTenantIntegritySummary } from '@/lib/integrity/tenant-integrity'

type LeadView = 'all' | 'review' | 'waiting' | 'failed' | 'pushed'

function resolveInitialView(searchParams: Record<string, string | string[] | undefined>): LeadView {
  const explicitView = typeof searchParams.view === 'string' ? searchParams.view : null
  if (explicitView && ['all', 'review', 'waiting', 'failed', 'pushed'].includes(explicitView)) {
    return explicitView as LeadView
  }

  const crmPushState = typeof searchParams.crmPushState === 'string' ? searchParams.crmPushState : null
  if (crmPushState === 'failed') return 'failed'
  if (crmPushState === 'queued' || crmPushState === 'processing') return 'waiting'
  if (crmPushState === 'succeeded') return 'pushed'

  const status = typeof searchParams.status === 'string' ? searchParams.status : null
  if (status === 'pending_review' || status === 'awaiting_approval') return 'review'
  if (status === 'pushed_to_crm') return 'pushed'

  return 'all'
}

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Fulcrum — Leads',
  description: 'View and manage your discovered leads',
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  let orgId: string | null | undefined = null
  try {
    const session = await auth()
    orgId = session.orgId
  } catch {}
  if (!orgId) redirect('/')

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true, crmType: true },
  })
  if (!tenant) redirect('/step-1')

  const [resolvedSearchParams, leads, integrity] = await Promise.all([
    searchParams,
    prisma.lead.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ discoveredAt: 'desc' }, { fulcrumScore: 'desc' }],
      take: 150,
      select: {
        id: true,
        fullName: true,
        title: true,
        company: true,
        location: true,
        fulcrumScore: true,
        fulcrumGrade: true,
        fitScore: true,
        intentScore: true,
        status: true,
        firstLine: true,
        linkedinUrl: true,
        discoveredAt: true,
        pushedToCrmAt: true,
        crmLeadId: true,
        crmPushState: true,
        crmPushAttempts: true,
        crmPushLastError: true,
        approvedAt: true,
        approvedBy: true,
      },
    }),
    getTenantIntegritySummary(tenant.id),
  ])

  const [crmActivitySummary, crmActivityFeed] = await Promise.all([
    getTenantCrmPushEventSummary({
      tenantId: tenant.id,
      window: '7d',
    }),
    listTenantCrmPushEvents({
      tenantId: tenant.id,
      filters: {
        window: '7d',
      },
      page: 1,
      pageSize: 25,
    }),
  ])

  const serialized = leads.map((lead) => ({
    ...lead,
    fulcrumScore: Number(lead.fulcrumScore),
    fitScore: Number(lead.fitScore),
    intentScore: Number(lead.intentScore),
    discoveredAt: lead.discoveredAt.toISOString(),
    pushedToCrmAt: lead.pushedToCrmAt?.toISOString() ?? null,
    approvedAt: lead.approvedAt?.toISOString() ?? null,
  }))

  return (
    <LeadsClient
      initialLeads={serialized}
      crmType={tenant.crmType}
      crmHealth={integrity.crmHealth}
      initialCrmActivitySummary={crmActivitySummary}
      initialCrmActivityFeed={crmActivityFeed}
      initialView={resolveInitialView(resolvedSearchParams)}
    />
  )
}
