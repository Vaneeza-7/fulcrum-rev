import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { SettingsClient } from './SettingsClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Fulcrum — Settings',
  description: 'Manage your tenant configuration',
}

export default async function SettingsPage() {
  let orgId: string | null | undefined = null
  try {
    const session = await auth()
    orgId = session.orgId
  } catch {}
  if (!orgId) redirect('/')

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    include: {
      searchQueries: true,
      intentKeywords: true,
      scoringConfigs: true,
      slackConfig: true,
    },
  })
  if (!tenant) redirect('/step-1')

  const queries = tenant.searchQueries.map((q) => ({
    queryName: q.queryName,
    searchQuery: q.searchQuery as {
      keywords: string
      industry?: string
      companySize?: string
      additionalKeywords?: string
    },
    maxResults: q.maxResults,
  }))

  const keywords = tenant.intentKeywords.map((k) => ({
    keyword: k.keyword,
    intentScore: Number(k.intentScore),
    category: k.category ?? '',
  }))

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

  return (
    <SettingsClient
      tenant={{
        name: tenant.name,
        productType: tenant.productType,
        crmType: tenant.crmType ?? 'zoho',
        crmConfig: tenant.crmConfig as Record<string, string>,
      }}
      searchQueries={queries}
      intentKeywords={keywords}
      scoringConfig={scoring}
      hasSlack={!!tenant.slackConfig}
    />
  )
}
