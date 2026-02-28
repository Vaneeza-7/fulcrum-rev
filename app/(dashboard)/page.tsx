// app/(dashboard)/page.tsx
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { ColdStartGate } from '@/lib/cold-start'
import { CalibrationWidget } from '@/components/dashboard/CalibrationWidget'
import { ROIAttributionService } from '@/lib/roi/attribution-service'
import { getROIAttribution } from '@/lib/roi/attribution-tagger'
import { ROIAttributionTag } from '@/components/roi/ROIAttributionTag'

export const metadata = {
  title: 'Fulcrum — Dashboard',
  description: 'Your RevOps command center',
}

export default async function DashboardPage() {
  let orgId: string | null | undefined = null
  try {
    const session = await auth()
    orgId = session.orgId
  } catch {
    // Clerk not configured — show setup message
  }
  if (!orgId) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4">Fulcrum</h1>
          <p className="text-gray-400">
            Sign in and create an organization to access your RevOps dashboard.
          </p>
        </div>
      </div>
    )
  }

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
  })
  if (!tenant) redirect('/step-1')

  const coldStartStatus = await ColdStartGate.getStatus(tenant.id)

  // Pipeline stats
  const [totalLeads, pendingReview, pushedToCrm, gradeRows] = await Promise.all([
    prisma.lead.count({ where: { tenantId: tenant.id } }),
    prisma.lead.count({ where: { tenantId: tenant.id, status: { in: ['pending_review', 'awaiting_approval'] } } }),
    prisma.lead.count({ where: { tenantId: tenant.id, status: 'pushed_to_crm' } }),
    prisma.lead.groupBy({
      by: ['fulcrumGrade'],
      where: { tenantId: tenant.id, fulcrumGrade: { not: null } },
      _count: true,
    }),
  ])

  const gradeDistribution: Record<string, number> = {}
  for (const row of gradeRows) {
    if (row.fulcrumGrade) {
      gradeDistribution[row.fulcrumGrade] = row._count
    }
  }

  // Last pipeline run
  const lastAudit = await prisma.auditLog.findFirst({
    where: { tenantId: tenant.id, actionType: 'pipeline_completed' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, details: true },
  })

  // ROI summary + attribution tag
  const roiSummary = await ROIAttributionService.getTenantROISummary(tenant.id)
  const roiLeadIds = (await prisma.rOIAttribution.findMany({
    where: { tenantId: tenant.id },
    select: { leadId: true },
  })).map((r) => r.leadId)
  const roiAttribution = await getROIAttribution(roiLeadIds, null)

  // Top 5 recent leads
  const topLeads = await prisma.lead.findMany({
    where: { tenantId: tenant.id },
    orderBy: { fulcrumScore: 'desc' },
    take: 5,
    select: {
      id: true,
      fullName: true,
      title: true,
      company: true,
      fulcrumScore: true,
      fulcrumGrade: true,
      status: true,
      discoveredAt: true,
    },
  })

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">{tenant.name}</h1>
            <p className="text-sm text-gray-400">RevOps Dashboard</p>
          </div>
        </div>

        {/* Top row: Calibration + Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* AI Confidence Meter */}
          <div className="lg:col-span-1">
            <CalibrationWidget
              initialCalibration={coldStartStatus.calibrationSignificance}
              coldStartActive={coldStartStatus.isActive}
              daysRemaining={coldStartStatus.daysRemaining}
            />
          </div>

          {/* Pipeline Stats */}
          <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Total Leads" value={totalLeads} />
            <StatCard label="Pending Review" value={pendingReview} highlight={pendingReview > 0} />
            <StatCard label="Pushed to CRM" value={pushedToCrm} />
            <StatCard
              label="Last Pipeline"
              value={lastAudit ? formatTimeAgo(lastAudit.createdAt) : 'Never'}
              isText
            />
          </div>
        </div>

        {/* ROI Hero Metric */}
        <div className="rounded-xl bg-gradient-to-r from-gray-900 to-gray-900/80 border border-gray-800 p-5 mb-8">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">
            Shadow ROI — Attributed Revenue
          </div>
          <div className="flex items-center">
            <span className="text-3xl font-bold text-white">
              ${roiSummary.totalRevenue.toLocaleString()}
            </span>
            <ROIAttributionTag
              label={roiAttribution.label}
              tooltipText={roiAttribution.tooltipText}
              className="ml-2 align-middle"
            />
          </div>
          {roiSummary.totalLeads > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              From {roiSummary.totalLeads} Fulcrum-sourced lead{roiSummary.totalLeads !== 1 ? 's' : ''} ·{' '}
              {roiSummary.avgMultiplier.toFixed(1)}x ROI multiplier
            </p>
          )}
        </div>

        {/* Grade Distribution */}
        {Object.keys(gradeDistribution).length > 0 && (
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-5 mb-8">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
              Grade Distribution
            </h2>
            <div className="flex gap-6">
              {['A+', 'A', 'B', 'C', 'D'].map((grade) => (
                <div key={grade} className="text-center">
                  <div className="text-2xl font-bold text-white">
                    {gradeDistribution[grade] ?? 0}
                  </div>
                  <div className="text-xs text-gray-500">{grade}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Leads */}
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
            Top Leads
          </h2>
          {topLeads.length > 0 ? (
            <div className="space-y-3">
              {topLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0"
                >
                  <div>
                    <p className="font-medium text-white">{lead.fullName}</p>
                    <p className="text-xs text-gray-500">
                      {lead.title} at {lead.company}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-cyan-400">
                      {Number(lead.fulcrumScore)}
                    </span>
                    <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-300">
                      {lead.fulcrumGrade}
                    </span>
                    <span className="text-xs text-gray-600">
                      {lead.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              No leads yet. The pipeline runs Mon–Fri at 5 AM EST.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  highlight = false,
  isText = false,
}: {
  label: string
  value: number | string
  highlight?: boolean
  isText?: boolean
}) {
  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div
        className={`text-xl font-bold ${
          highlight ? 'text-amber-400' : isText ? 'text-gray-300 text-sm' : 'text-white'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
