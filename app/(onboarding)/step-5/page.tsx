import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { Step5IntegrationsClient } from './Step5IntegrationsClient'

export const metadata = {
  title: 'Fulcrum — Integrations',
  description: 'Step 5: Connect your CRM and Slack',
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
    include: { slackConfig: true },
  })
  if (!tenant) redirect('/step-1')

  return (
    <Step5IntegrationsClient
      currentCrmType={tenant.crmType}
      currentCrmConfig={tenant.crmConfig as Record<string, string>}
      hasSlack={!!tenant.slackConfig}
    />
  )
}
