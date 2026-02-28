import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { Step1TemplateClient } from './Step1TemplateClient'

export const metadata = {
  title: 'Fulcrum — Get Started',
  description: 'Step 1: Choose a template to get started',
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

  // If tenant already exists, skip to step 2
  const existing = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
  })
  if (existing) redirect('/step-2')

  return <Step1TemplateClient />
}
