import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { Step2QueriesClient } from './Step2QueriesClient'

export const metadata = {
  title: 'Fulcrum — Search Queries',
  description: 'Step 2: Define your ICP search queries',
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
    include: { searchQueries: true },
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

  return <Step2QueriesClient initialQueries={queries} />
}
