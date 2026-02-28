import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { Step1CompanyClient } from './Step1CompanyClient'

export const metadata = {
  title: 'Fulcrum — Your Company',
  description: 'Step 1: Tell us about your business',
}

export default async function Step1Page() {
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
    include: { profile: true },
  })

  // No tenant yet — fresh start
  if (!tenant) {
    return <Step1CompanyClient />
  }

  // Tenant exists and has a profile — skip ahead
  if (tenant.profile) {
    redirect('/step-2')
  }

  // Tenant exists but no profile — pre-fill the name
  return <Step1CompanyClient existingName={tenant.name} />
}
