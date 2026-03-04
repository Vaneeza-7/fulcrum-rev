import { CreateOrganization } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'

export const metadata = {
  title: 'Fulcrum — Continue Setup',
  description: 'Create or select an organization to continue into Fulcrum.',
}

export default async function AuthContinuePage() {
  let userId: string | null | undefined = null
  let orgId: string | null | undefined = null

  try {
    const session = await auth()
    userId = session.userId
    orgId = session.orgId
  } catch {
    // Clerk not configured or auth failed.
  }

  if (!userId) {
    redirect('/')
  }

  if (orgId) {
    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true },
    })

    if (tenant) {
      redirect('/')
    }

    redirect('/step-1')
  }

  return (
    <div className="min-h-screen bg-gray-950 px-6 py-16 text-white">
      <div className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-gray-800 bg-gray-900/70 p-8 text-center shadow-2xl shadow-black/20">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-cyan">Workspace Setup</p>
        <h1 className="mt-4 text-3xl font-bold">Create your Fulcrum workspace</h1>
        <p className="mt-3 text-sm text-gray-300">
          Your account is ready. Create an organization to continue into onboarding.
        </p>

        <div className="mt-8">
          <CreateOrganization afterCreateOrganizationUrl="/step-1" />
        </div>

        <Link
          href="/"
          className="mt-6 text-sm font-medium text-gray-400 transition-colors hover:text-white"
        >
          Back to homepage
        </Link>
      </div>
    </div>
  )
}
