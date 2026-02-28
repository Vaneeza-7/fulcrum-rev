import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { Step3KeywordsClient } from './Step3KeywordsClient'

export const metadata = {
  title: 'Fulcrum — Intent Keywords',
  description: 'Step 3: Define intent keywords for signal detection',
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
    include: { intentKeywords: true },
  })
  if (!tenant) redirect('/step-1')

  const keywords = tenant.intentKeywords.map((k) => ({
    keyword: k.keyword,
    intentScore: Number(k.intentScore),
    category: k.category ?? '',
  }))

  return <Step3KeywordsClient initialKeywords={keywords} />
}
