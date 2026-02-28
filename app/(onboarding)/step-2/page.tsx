import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { Step2ICPClient } from './Step2ICPClient'

export const metadata = {
  title: 'Fulcrum — Ideal Customer',
  description: 'Step 2: Define your ideal customer profile',
}

export default async function Step2Page() {
  let orgId: string | null | undefined = null
  try {
    const session = await auth()
    orgId = session.orgId
  } catch {}
  if (!orgId) redirect('/')

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    include: { profile: true },
  })

  if (!tenant) redirect('/step-1')
  if (!tenant.profile) redirect('/step-1')

  const profile = tenant.profile

  return (
    <Step2ICPClient
      initialData={{
        targetIndustries: (profile.targetIndustries as string[]) ?? [],
        targetCompanySizes: (profile.targetCompanySizes as string[]) ?? [],
        targetRoles: (profile.targetRoles as string[]) ?? [],
        targetGeography: (profile.targetGeography as string[]) ?? [],
        painPoints: profile.painPoints ?? '',
        buyingSignals: profile.buyingSignals ?? '',
        searchKeywords: profile.searchKeywords ?? '',
      }}
    />
  )
}
