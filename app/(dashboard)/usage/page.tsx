// app/(dashboard)/usage/page.tsx
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { ROIAttributionService } from '@/lib/roi/attribution-service'
import { getROIAttribution } from '@/lib/roi/attribution-tagger'
import { ROIAttributionTag } from '@/components/roi/ROIAttributionTag'

export const metadata = {
  title: 'Fulcrum — Usage & ROI',
  description: 'Pipeline usage and Shadow ROI tracking',
}

export default async function UsagePage() {
  const { orgId } = await auth()
  if (!orgId) redirect('/sign-in')

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
  })
  if (!tenant) redirect('/onboarding/step-1')

  // Fetch ROI summary and top leads
  const [roiSummary, topROILeads, totalLeads, pushedToCrm, pipelineRuns] = await Promise.all([
    ROIAttributionService.getTenantROISummary(tenant.id),
    ROIAttributionService.getTopROILeads(tenant.id, 10),
    prisma.lead.count({ where: { tenantId: tenant.id } }),
    prisma.lead.count({ where: { tenantId: tenant.id, status: 'pushed_to_crm' } }),
    prisma.auditLog.count({
      where: { tenantId: tenant.id, actionType: 'pipeline_completed' },
    }),
  ])

  // Get attribution label for all ROI leads
  const roiLeadIds = topROILeads.map((l) => l.leadId)
  // Pass null for crmAdapter — shows ESTIMATED until CRM adapter is wired
  const attribution = await getROIAttribution(roiLeadIds, null)

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Header */}
        <h1 className="text-2xl font-bold mb-1">Usage & ROI</h1>
        <p className="text-sm text-gray-400 mb-8">
          Pipeline consumption and Shadow ROI tracking for {tenant.name}
        </p>

        {/* Shadow ROI Hero Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <ShadowROICard
            label="Attributed Revenue"
            value={`$${roiSummary.totalRevenue.toLocaleString()}`}
            attribution={attribution}
          />
          <ShadowROICard
            label="Credit Spend"
            value={`$${roiSummary.totalSpend.toLocaleString()}`}
            attribution={attribution}
          />
          <ShadowROICard
            label="ROI Multiplier"
            value={`${roiSummary.avgMultiplier.toFixed(1)}x`}
            attribution={attribution}
            isDollar={false}
          />
          <ShadowROICard
            label="Fulcrum-Sourced Leads"
            value={String(roiSummary.totalLeads)}
            attribution={attribution}
            isDollar={false}
          />
        </div>

        {/* Pipeline Usage Stats */}
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5 mb-8">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
            Pipeline Usage
          </h2>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-2xl font-bold text-white">{totalLeads}</div>
              <div className="text-xs text-gray-500">Total Leads Processed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{pushedToCrm}</div>
              <div className="text-xs text-gray-500">Pushed to CRM</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{pipelineRuns}</div>
              <div className="text-xs text-gray-500">Pipeline Runs</div>
            </div>
          </div>
        </div>

        {/* Top ROI Leads */}
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
            Top ROI Leads
          </h2>
          {topROILeads.length > 0 ? (
            <div className="space-y-3">
              {topROILeads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0"
                >
                  <div>
                    <p className="text-xs text-gray-500 font-mono">
                      {lead.sourceTag.sourceType.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-white">
                      ${(lead.estimatedDealValue ?? 0).toLocaleString()}
                      <ROIAttributionTag
                        label={attribution.label}
                        tooltipText={attribution.tooltipText}
                        className="ml-1 align-middle"
                      />
                    </span>
                    <span className="text-xs text-cyan-400 font-semibold">
                      {lead.roiMultiplier.toFixed(1)}x
                    </span>
                    <span className="text-xs text-gray-600">
                      {lead.stage ?? 'unknown'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              No ROI data yet. Leads will appear here once the pipeline runs and CRM syncs.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function ShadowROICard({
  label,
  value,
  attribution,
  isDollar = true,
}: {
  label: string
  value: string
  attribution: { label: 'ESTIMATED' | 'VERIFIED' | 'MIXED'; tooltipText: string }
  isDollar?: boolean
}) {
  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">{label}</div>
      <div className="flex items-center">
        <span className="text-2xl font-bold text-white">{value}</span>
        {isDollar && (
          <ROIAttributionTag
            label={attribution.label}
            tooltipText={attribution.tooltipText}
            className="ml-2 align-middle"
          />
        )}
      </div>
    </div>
  )
}
