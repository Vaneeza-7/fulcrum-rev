import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { Step5ReviewClient } from './Step5ReviewClient'

export const metadata = {
  title: 'Fulcrum — Review & Launch',
  description: 'Step 5: Review your configuration and launch your pipeline',
}

export default async function Step5Page() {
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
      deliveryPreference: true,
      searchQueries: true,
      intentKeywords: true,
      scoringConfigs: true,
      slackConfig: true,
    },
  })

  if (!tenant) redirect('/step-1')

  const profile = tenant.profile
  if (!profile) redirect('/step-1')

  // Build company summary
  const company = {
    companyName: profile.companyName,
    websiteUrl: profile.websiteUrl,
    industry: profile.industry,
    companySize: profile.companySize,
    productDescription: profile.productDescription,
    problemsSolved: profile.problemsSolved,
    valueProposition: profile.valueProposition,
  }

  // Build ICP summary
  const icp = {
    targetIndustries: (profile.targetIndustries as string[]) ?? [],
    targetCompanySizes: (profile.targetCompanySizes as string[]) ?? [],
    targetRoles: (profile.targetRoles as string[]) ?? [],
    targetGeography: (profile.targetGeography as string[]) ?? [],
    painPoints: profile.painPoints,
    buyingSignals: profile.buyingSignals,
  }

  // Build competitors list
  const competitors = tenant.competitors.map((c) => ({
    name: c.name,
    websiteUrl: c.websiteUrl,
    differentiator: c.differentiator,
  }))

  // Build delivery summary
  const dp = tenant.deliveryPreference
  const delivery = dp
    ? {
        leadVolumeTarget: dp.leadVolumeTarget,
        scheduleType: dp.scheduleType,
        deliveryTime: dp.deliveryTime,
        timezone: dp.timezone,
        channels: [
          dp.crmEnabled ? 'crm' : null,
          dp.slackEnabled ? 'slack' : null,
          dp.emailEnabled ? 'email' : null,
        ].filter(Boolean) as string[],
      }
    : null

  // Build initialConfig if search queries were already generated
  const hasConfig = tenant.searchQueries.length > 0
  const initialConfig = hasConfig
    ? {
        searchQueries: tenant.searchQueries.map((q) => ({
          queryName: q.queryName,
          searchQuery: q.searchQuery,
        })),
        intentKeywords: tenant.intentKeywords.map((k) => ({
          keyword: k.keyword,
          intentScore: Number(k.intentScore),
          category: k.category ?? '',
        })),
      }
    : null

  return (
    <Step5ReviewClient
      company={company}
      icp={icp}
      competitors={competitors}
      delivery={delivery}
      initialConfig={initialConfig}
    />
  )
}
