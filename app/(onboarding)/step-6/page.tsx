// app/(onboarding)/step-6/page.tsx
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { ColdStartGate } from '@/lib/cold-start'
import { Step6CalibrationClient } from './Step6CalibrationClient'

export const metadata = {
  title: 'Fulcrum — AI Calibration',
  description: 'Step 6: Review your AI calibration status',
}

export default async function Step6CalibrationPage() {
  let orgId: string | null | undefined = null
  try {
    const session = await auth()
    orgId = session.orgId
  } catch {
    // Clerk not configured
  }
  if (!orgId) redirect('/')

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
  })
  if (!tenant) redirect('/step-1')

  const coldStartStatus = await ColdStartGate.getStatus(tenant.id)

  // Fetch a sample of recent leads for HITL practice during onboarding
  const recentLeads = await prisma.lead.findMany({
    where: { tenantId: tenant.id, status: 'awaiting_approval' },
    orderBy: { fulcrumScore: 'desc' },
    take: 5,
    select: {
      id: true,
      fullName: true,
      title: true,
      company: true,
      fulcrumScore: true,
      fulcrumGrade: true,
      fitScore: true,
      intentScore: true,
      firstLine: true,
      linkedinUrl: true,
    },
  })

  const leads = recentLeads.map((l) => ({
    id: l.id,
    fullName: l.fullName,
    title: l.title ?? '',
    company: l.company ?? '',
    fulcrumScore: Number(l.fulcrumScore),
    fulcrumGrade: l.fulcrumGrade ?? 'D',
    fitScore: Number(l.fitScore),
    intentScore: Number(l.intentScore),
    firstLine: l.firstLine ?? '',
    linkedinUrl: l.linkedinUrl,
  }))

  return (
    <Step6CalibrationClient
      initialCalibration={coldStartStatus.calibrationSignificance}
      coldStartActive={coldStartStatus.isActive}
      daysRemaining={coldStartStatus.daysRemaining}
      leads={leads}
    />
  )
}
