// app/(dashboard)/page.tsx
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { SignUpButton } from '@clerk/nextjs'
import { prisma } from '@/lib/db'
import { ColdStartGate } from '@/lib/cold-start'
import { CalibrationWidget } from '@/components/dashboard/CalibrationWidget'
import { ROIAttributionService } from '@/lib/roi/attribution-service'
import { getROIAttribution } from '@/lib/roi/attribution-tagger'
import { ROIAttributionTag } from '@/components/roi/ROIAttributionTag'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Fulcrum — Revenue Operating System',
  description: 'AI-powered lead discovery, scoring, and delivery for modern revenue teams.',
}

export default async function DashboardPage() {
  let orgId: string | null | undefined = null
  try {
    const session = await auth()
    orgId = session.orgId
  } catch {
    // Clerk not configured — show landing page
  }
  if (!orgId) {
    return <LandingPage />
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
          <div className="lg:col-span-1">
            <CalibrationWidget
              initialCalibration={coldStartStatus.calibrationSignificance}
              coldStartActive={coldStartStatus.isActive}
              daysRemaining={coldStartStatus.daysRemaining}
            />
          </div>

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
                    <span className="text-sm font-semibold text-brand-cyan">
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
              No leads yet. The pipeline runs Mon-Fri at 5 AM EST.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ——————————————————————————————
   Landing Page (unauthenticated)
   —————————————————————————————— */

function LandingPage() {
  return (
    <div className="bg-brand-bg text-brand-black">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-5xl px-6 pt-24 pb-20 sm:pt-32 sm:pb-28 text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[1.1]">
            Your Pipeline Runs.
            <br />
            <span className="text-brand-cyan">Or It Doesn&apos;t.</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-brand-black/60 max-w-2xl mx-auto leading-relaxed">
            FulcrumOS finds your next 20-30 high-intent prospects every morning — scored, ranked, and delivered before your first meeting.
          </p>
          <div className="mt-10">
            <SignUpButton mode="modal">
              <button className="bg-black px-8 py-3.5 text-base font-bold text-white hover:bg-black/80 transition-colors">
                Start Free — No CRM Required
              </button>
            </SignUpButton>
          </div>
          <p className="mt-4 text-sm text-brand-black/40">No credit card required</p>
        </div>

        {/* Subtle grid decoration */}
        <div className="absolute inset-0 -z-10 opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(circle, #111 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
      </section>

      {/* Problem */}
      <section className="border-t border-brand-black/5">
        <div className="mx-auto max-w-4xl px-6 py-20 sm:py-28">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-center leading-tight">
            You&apos;re Not Losing Deals to Competitors.
            <br />
            You&apos;re Losing Them to Your Pipeline.
          </h2>
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              'Your reps are spending 40% of their time finding leads instead of closing them.',
              "Your scoring model hasn't been updated in 6 months.",
              "Your CRM is full of contacts, but you can't tell which ones are ready to buy.",
              "Revenue isn't a sales problem. It's an operating system problem.",
            ].map((point, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="mt-1.5 h-2 w-2 rounded-full bg-brand-cyan shrink-0" />
                <p className="text-brand-black/70 leading-relaxed">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What it is */}
      <section className="border-t border-brand-black/5 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-20 sm:py-28 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-cyan mb-4">What it is</p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
            The Revenue Operating System
          </h2>
          <p className="mt-6 text-lg text-brand-black/60 max-w-2xl mx-auto leading-relaxed">
            FulcrumOS is the AI-powered engine behind modern revenue teams. It discovers, scores, and delivers high-intent leads — every single day.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-brand-black/5">
        <div className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-cyan text-center mb-4">How it works</p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-center mb-16">
            Four Steps. Zero Busywork.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              {
                step: '01',
                title: 'Discover',
                description: 'Tell us your ICP in plain English. FulcrumOS builds dynamic search queries, monitors intent signals, and surfaces prospects that match — no boolean strings required.',
              },
              {
                step: '02',
                title: 'Score',
                description: 'Every lead is scored across fit, intent, and engagement — then graded A+ through D. Only the best make it to your team.',
              },
              {
                step: '03',
                title: 'Act',
                description: 'Leads are pushed to your CRM, posted to Slack, or emailed as a morning spreadsheet. Your call.',
              },
              {
                step: '04',
                title: 'Prove',
                description: "Shadow ROI tracks every lead from discovery through closed-won. You'll always know what FulcrumOS is worth.",
              },
            ].map((item) => (
              <div key={item.step} className="rounded-xl border border-brand-black/5 bg-white p-8">
                <span className="text-xs font-bold text-brand-cyan tracking-widest">{item.step}</span>
                <h3 className="mt-3 text-xl font-bold">{item.title}</h3>
                <p className="mt-3 text-brand-black/60 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Proof points */}
      <section className="border-t border-brand-black/5 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-20 sm:py-28">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-cyan text-center mb-4">Built for results</p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-center mb-12">
            What You Get
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              '25 qualified leads per day, Mon-Fri',
              'AI-generated ICP calibration in under 5 minutes',
              'CRM, Slack, or email delivery — your choice',
              '30-day cold-start with human-in-the-loop approval gating',
              'Shadow ROI attribution from day one',
            ].map((point, i) => (
              <div
                key={i}
                className="rounded-xl border border-brand-black/5 bg-brand-bg p-5 flex items-start gap-3"
              >
                <svg className="h-5 w-5 text-brand-cyan shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span className="text-sm font-medium text-brand-black/80">{point}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="border-t border-brand-black/5">
        <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28 text-center">
          <svg className="mx-auto h-8 w-8 text-brand-cyan/40 mb-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
          </svg>
          <blockquote className="text-xl sm:text-2xl font-medium leading-relaxed text-brand-black/80">
            &ldquo;We went from spending 3 hours a day prospecting to zero. Fulcrum delivers better leads than our SDRs were finding manually.&rdquo;
          </blockquote>
          <div className="mt-6">
            <p className="font-bold">Jason Ott</p>
            <p className="text-sm text-brand-black/50">Pulse Connect</p>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-brand-black/5 bg-brand-black">
        <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28 text-center">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight">
            You Don&apos;t Need More Tools.
            <br />
            You Need a System That Runs.
          </h2>
          <p className="mt-6 text-lg text-white/60 max-w-xl mx-auto leading-relaxed">
            Start your 30-day calibration. See scored leads in your inbox by tomorrow morning.
          </p>
          <div className="mt-10">
            <SignUpButton mode="modal">
              <button className="bg-brand-cyan px-8 py-3.5 text-base font-bold text-black hover:bg-brand-cyan/90 transition-colors">
                Launch My Pipeline
              </button>
            </SignUpButton>
          </div>
          <p className="mt-4 text-sm text-white/40">No credit card. No CRM required.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-brand-black/5 bg-brand-bg">
        <div className="mx-auto max-w-7xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <a href="https://fulcrumcollective.io" target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Fulcrum Collective" className="h-5" />
          </a>
          <p className="text-sm text-brand-black/40">Built for teams that run on results.</p>
        </div>
      </footer>
    </div>
  )
}

/* ——————————————————————————————
   Dashboard components
   —————————————————————————————— */

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
