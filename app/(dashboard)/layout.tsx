import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { CreateOrganization } from '@clerk/nextjs'
import { prisma } from '@/lib/db'
import { CleanSlateProvider } from '@/components/providers/CleanSlateProvider'
import { SidebarIntegritySlot } from '@/components/sidebar/SidebarIntegritySlot'
import { getTenantBillingSummary } from '@/lib/billing/summary'

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/leads', label: 'Leads' },
  { href: '/usage', label: 'Usage & ROI' },
  { href: '/settings', label: 'Settings' },
]

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let orgId: string | null | undefined = null
  let userId: string | null | undefined = null
  try {
    const session = await auth()
    orgId = session.orgId
    userId = session.userId
  } catch {
    // Clerk not configured or auth failed
  }

  if (!orgId) {
    if (userId) {
      // Signed in but no org — show org creation so we get an orgId
      return (
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Fulcrum</h1>
            <p className="text-gray-500 mb-8">Create an organization to get started.</p>
            <CreateOrganization
              afterCreateOrganizationUrl="/step-1"
            />
          </div>
        </div>
      )
    }
    // Not signed in — render children so the page-level fallback UI can show.
    return <>{children}</>
  }

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
  })
  if (!tenant) redirect('/step-1')

  // Count leads that were paused while credits were zero
  const cancelledCount = await prisma.lead.count({
    where: { tenantId: tenant.id, status: 'cancelled_creditzero' },
  })

  const billingSummary = await getTenantBillingSummary(tenant.id)
  const creditBalance = billingSummary.billing.remainingIncludedCredits

  return (
    <CleanSlateProvider cancelledCount={cancelledCount} creditBalance={creditBalance}>
      <div className="flex min-h-screen bg-gray-950">
        {/* Sidebar */}
        <aside className="hidden md:flex md:w-56 flex-col border-r border-gray-800 bg-gray-950">
          <div className="px-4 py-5">
            <span className="text-sm font-bold text-white tracking-wide">Fulcrum</span>
          </div>

          <nav className="flex-1 space-y-1 px-2">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="block rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-900 hover:text-white transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* System health */}
          <div className="px-4 py-3 border-t border-gray-800">
            <SidebarIntegritySlot />
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </CleanSlateProvider>
  )
}
