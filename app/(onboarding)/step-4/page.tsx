import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { Step4ScoringClient } from './Step4ScoringClient'

export const metadata = {
  title: 'Fulcrum — Scoring Config',
  description: 'Step 4: Configure your lead scoring weights',
}

export default async function Step4Page() {
  let orgId: string | null | undefined = null
  try {
    const session = await auth()
    orgId = session.orgId
  } catch {}
  if (!orgId) redirect('/')

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    include: { scoringConfigs: true },
  })
  if (!tenant) redirect('/step-1')

  const scoring = {
    company_size: [] as Array<{ min: number; max: number; points: number }>,
    industry_fit: [] as Array<{ match: string; points: number }>,
    role_authority: [] as Array<{ pattern: string; points: number }>,
    revenue_signals: [] as Array<{ signal: string; points: number }>,
  }

  for (const config of tenant.scoringConfigs) {
    const key = config.configType as keyof typeof scoring
    if (key in scoring) {
      scoring[key] = config.configData as any
    }
  }

  return <Step4ScoringClient initialScoring={scoring} />
}
