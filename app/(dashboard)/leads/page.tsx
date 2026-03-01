import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { LeadsClient } from './LeadsClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Fulcrum — Leads',
  description: 'View and manage your discovered leads',
}

export default async function LeadsPage() {
  let orgId: string | null | undefined = null
  try {
    const session = await auth()
    orgId = session.orgId
  } catch {}
  if (!orgId) redirect('/')

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
  })
  if (!tenant) redirect('/step-1')

  const leads = await prisma.lead.findMany({
    where: { tenantId: tenant.id },
    orderBy: { fulcrumScore: 'desc' },
    take: 100,
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
    },
  })

  const statusCounts = await prisma.lead.groupBy({
    by: ['status'],
    where: { tenantId: tenant.id },
    _count: true,
  })

  const serialized = leads.map((l) => ({
    ...l,
    fulcrumScore: Number(l.fulcrumScore),
    fitScore: Number(l.fitScore),
    intentScore: Number(l.intentScore),
    discoveredAt: l.discoveredAt.toISOString(),
  }))

  const counts: Record<string, number> = {}
  statusCounts.forEach((s) => {
    counts[s.status] = s._count
  })

  return <LeadsClient initialLeads={serialized} statusCounts={counts} />
}
