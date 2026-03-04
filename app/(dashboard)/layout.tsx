import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { SidebarIntegritySlot } from '@/components/sidebar/SidebarIntegritySlot'

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
    // Signed in but no org and signed out users should still be able to render
    // page-level fallback UI (including the landing page on `/`).
    return <>{children}</>
  }

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
  })
  if (!tenant) redirect('/step-1')

  return (
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
  )
}
