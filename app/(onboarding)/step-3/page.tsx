import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { Step3CompetitorsClient } from './Step3CompetitorsClient'

export const metadata = {
  title: 'Fulcrum — Competitors & Positioning',
  description: 'Step 3: Define your competitive landscape',
}

export default async function Step3Page() {
  let orgId: string | null | undefined = null
  try {
    const session = await auth()
    orgId = session.orgId
  } catch {}
  if (!orgId) redirect('/')

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    include: {
      profile: true,
      competitors: true,
    },
  })

  if (!tenant) redirect('/step-1')
  if (!tenant.profile) redirect('/step-2')

  // Check that ICP data has been filled in (at minimum, the profile exists from step 1)
  const profile = tenant.profile
  const hasIcpData =
    ((profile.targetIndustries as string[]) ?? []).length > 0 ||
    ((profile.targetCompanySizes as string[]) ?? []).length > 0 ||
    ((profile.targetRoles as string[]) ?? []).length > 0 ||
    profile.painPoints ||
    profile.buyingSignals

  if (!hasIcpData) redirect('/step-2')

  const competitors = tenant.competitors.map((c) => ({
    name: c.name,
    websiteUrl: c.websiteUrl ?? '',
    differentiator: c.differentiator ?? '',
  }))

  return (
    <Step3CompetitorsClient
      initialCompetitors={competitors}
      initialDifferentiation={profile.competitorDifferentiation ?? ''}
      initialWhyChooseUs={profile.whyChooseUs ?? ''}
    />
  )
}
