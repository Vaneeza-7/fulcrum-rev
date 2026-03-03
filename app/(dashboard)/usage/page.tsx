import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { ROIAttributionService } from '@/lib/roi/attribution-service'
import { getROIAttribution } from '@/lib/roi/attribution-tagger'
import { ROIAttributionTag } from '@/components/roi/ROIAttributionTag'
import { getTenantBillingSummary } from '@/lib/billing/summary'
import { getTenantBillingHistory } from '@/lib/billing/history'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Fulcrum — Usage & ROI',
  description: 'Pipeline usage, exact credit billing, and Shadow ROI tracking',
}

export default async function UsagePage() {
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
  })
  if (!tenant) redirect('/step-1')

  const [roiSummary, topROILeads, totalLeads, pushedToCrm, pipelineRuns, billingSummary, billingHistory] = await Promise.all([
    ROIAttributionService.getTenantROISummary(tenant.id),
    ROIAttributionService.getTopROILeads(tenant.id, 10),
    prisma.lead.count({ where: { tenantId: tenant.id } }),
    prisma.lead.count({ where: { tenantId: tenant.id, status: 'pushed_to_crm' } }),
    prisma.auditLog.count({
      where: { tenantId: tenant.id, actionType: 'pipeline_completed' },
    }),
    getTenantBillingSummary(tenant.id),
    getTenantBillingHistory(tenant.id, { page: 1, pageSize: 25, billableOnly: false }),
  ])

  const attribution = await getROIAttribution(topROILeads.map((lead) => lead.leadId), null)
  const billing = billingSummary.billing

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-bold">Usage & ROI</h1>
        <p className="mb-8 text-sm text-gray-400">
          Pipeline consumption, exact credit billing, and Shadow ROI tracking for {tenant.name}
        </p>

        <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ShadowROICard
            label="Attributed Revenue"
            value={`$${roiSummary.totalRevenue.toLocaleString()}`}
            attribution={attribution}
          />
          <ShadowROICard
            label="Provider Cost Spend"
            value={`$${roiSummary.totalSpend.toFixed(2)}`}
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

        <div className="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-gray-400">
            Pipeline Usage
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <StatBlock label="Total Leads Processed" value={String(totalLeads)} />
            <StatBlock label="Pushed to CRM" value={String(pushedToCrm)} />
            <StatBlock label="Pipeline Runs" value={String(pipelineRuns)} />
          </div>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-gray-400">
              Fulcrum Credits
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatBlock label="Plan" value={billing.planSlug ?? 'unassigned'} />
              <StatBlock label="Billing Source" value={billing.billingSource} />
              <StatBlock label="Included" value={billing.includedCredits} />
              <StatBlock label="Used" value={billing.usedCredits} />
              <StatBlock label="Remaining" value={billing.remainingCredits} />
              <StatBlock label="Status" value={billing.subscriptionStatus} />
              <StatBlock label="Credit Unit" value={`$${billing.creditUnitUsd}`} />
              <StatBlock label="Current Period" value={`${billing.currentPeriodStart ? new Date(billing.currentPeriodStart).toLocaleDateString() : 'N/A'} - ${billing.currentPeriodEnd ? new Date(billing.currentPeriodEnd).toLocaleDateString() : 'N/A'}`} />
            </div>
          </section>

          <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-gray-400">
              Projected Billing
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatBlock label="Projected Billable" value={`$${Number(billing.projectedBillableUsd).toFixed(2)}`} />
              <StatBlock label="Metered Providers" value={String(billing.providerBreakdown.length)} />
              <StatBlock label="Unpriced Activity" value={String(billing.unpricedActivity.length)} />
            </div>
            {billing.unpricedActivity.length > 0 ? (
              <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                Some provider activity is tracked operationally but is not yet part of exact credit billing.
              </div>
            ) : null}
          </section>
        </div>

        <section className="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-gray-400">
            Provider Activity
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Provider</th>
                  <th className="pb-3 pr-4 font-medium">Stage</th>
                  <th className="pb-3 pr-4 font-medium">Requests</th>
                  <th className="pb-3 pr-4 font-medium">Credits</th>
                  <th className="pb-3 font-medium">Projected Billable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {billing.providerBreakdown.length > 0 ? billing.providerBreakdown.map((entry) => (
                  <tr key={`${entry.provider}:${entry.stage}`}>
                    <td className="py-3 pr-4 capitalize text-white">{entry.provider}</td>
                    <td className="py-3 pr-4 text-gray-300">{entry.stage}</td>
                    <td className="py-3 pr-4 text-gray-300">{entry.requestCount}</td>
                    <td className="py-3 pr-4 text-gray-300">{entry.credits}</td>
                    <td className="py-3 text-gray-300">${Number(entry.projectedBillableUsd).toFixed(2)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="py-4 text-gray-500">
                      No exact-cost provider usage recorded for this period yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {billing.unpricedActivity.length > 0 ? (
            <div className="mt-4 space-y-2 text-sm text-gray-400">
              {billing.unpricedActivity.map((entry) => (
                <div key={`${entry.provider}:${entry.stage}`}>
                  {entry.provider} / {entry.stage}: {entry.activityCount} activities ({entry.reason})
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-gray-400">
            Billing History
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Timestamp</th>
                  <th className="pb-3 pr-4 font-medium">Provider</th>
                  <th className="pb-3 pr-4 font-medium">Stage</th>
                  <th className="pb-3 pr-4 font-medium">Context</th>
                  <th className="pb-3 pr-4 font-medium">Usage</th>
                  <th className="pb-3 pr-4 font-medium">Credits</th>
                  <th className="pb-3 font-medium">Projected Billable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {billingHistory.entries.length > 0 ? billingHistory.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-3 pr-4 text-gray-300">{new Date(entry.createdAt).toLocaleString()}</td>
                    <td className="py-3 pr-4 capitalize text-white">{entry.provider}</td>
                    <td className="py-3 pr-4 text-gray-300">{entry.stage}</td>
                    <td className="py-3 pr-4 text-gray-300">{entry.leadName ?? entry.leadId ?? 'Job-level event'}</td>
                    <td className="py-3 pr-4 text-gray-300">
                      {entry.usage.requestCount} req / {entry.usage.inputTokens} in / {entry.usage.outputTokens} out
                    </td>
                    <td className="py-3 pr-4 text-gray-300">{entry.credits}</td>
                    <td className="py-3 text-gray-300">${Number(entry.projectedBillableUsd).toFixed(4)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={7} className="py-4 text-gray-500">
                      No billing history recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-gray-400">
            Top ROI Leads
          </h2>
          {topROILeads.length > 0 ? (
            <div className="space-y-3">
              {topROILeads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between border-b border-gray-800 py-2 last:border-0"
                >
                  <div>
                    <p className="font-mono text-xs text-gray-500">
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
                    <span className="text-xs font-semibold text-brand-cyan">
                      {lead.roiMultiplier.toFixed(1)}x
                    </span>
                    <span className="text-xs text-gray-600">{lead.stage ?? 'unknown'}</span>
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
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="mb-2 text-xs uppercase tracking-wide text-gray-500">{label}</div>
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

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}
