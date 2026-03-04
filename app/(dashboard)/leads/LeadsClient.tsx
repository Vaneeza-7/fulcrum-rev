'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'

interface Lead {
  id: string
  fullName: string
  title: string | null
  company: string | null
  location: string | null
  fulcrumScore: number
  fulcrumGrade: string | null
  fitScore: number
  intentScore: number
  status: string
  firstLine: string | null
  linkedinUrl: string
  discoveredAt: string
  pushedToCrmAt: string | null
  crmLeadId: string | null
  crmPushState: string
  crmPushAttempts: number
  crmPushLastError: string | null
  approvedAt: string | null
  approvedBy: string | null
}

interface CrmHealth {
  level: 'GREEN' | 'AMBER' | 'RED'
  queuedCount: number
  failedCount: number
  oldestQueuedMinutes: number | null
  duplicateRate30d: string
  paused: boolean
  message: string
  action: string
}

interface LeadsClientProps {
  initialLeads: Lead[]
  crmType: string | null
  crmHealth: CrmHealth
  initialView?: LeadView
}

type LeadView = 'all' | 'review' | 'waiting' | 'failed' | 'pushed'

interface LeadActionPayload {
  status: 'approved' | 'rejected'
  rejectionReason?: string
  rejectReason?: string
}

interface SerializedLeadActionResponse {
  id: string
  status: string
  crmPushState: string
  crmPushLastError: string | null
  approvedAt: string | null
  approvedBy: string | null
  crmLeadId: string | null
}

interface BulkErrorSummary {
  message: string
  count: number
}

const CRM_TYPE_LABELS: Record<string, string> = {
  hubspot: 'HubSpot',
  salesforce: 'Salesforce',
  zoho: 'Zoho',
}

const VIEW_LABELS: Record<LeadView, string> = {
  all: 'All Leads',
  review: 'Review Queue',
  waiting: 'Waiting to Push',
  failed: 'Failed to Push',
  pushed: 'Pushed Successfully',
}

const CRM_HEALTH_STYLES: Record<CrmHealth['level'], string> = {
  GREEN: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100',
  AMBER: 'border-amber-500/20 bg-amber-500/10 text-amber-100',
  RED: 'border-red-500/20 bg-red-500/10 text-red-100',
}

const GRADE_OPTIONS = ['A+', 'A', 'B', 'C', 'D'] as const

function getCrmLabel(crmType: string | null) {
  return crmType ? CRM_TYPE_LABELS[crmType] ?? 'CRM' : 'CRM'
}

export function isReviewable(lead: Lead) {
  return lead.status === 'pending_review' || lead.status === 'awaiting_approval'
}

export function canRetryCrmPush(lead: Lead) {
  return lead.status === 'approved' && lead.crmPushState === 'failed'
}

export function getLeadView(lead: Lead): LeadView {
  if (isReviewable(lead)) return 'review'
  if (lead.status === 'pushed_to_crm' || lead.crmPushState === 'succeeded') return 'pushed'
  if (lead.crmPushState === 'failed') return 'failed'
  if (lead.crmPushState === 'queued' || lead.crmPushState === 'processing') return 'waiting'
  return 'all'
}

function getCrmStatusLabel(lead: Lead, crmLabel: string) {
  switch (lead.crmPushState) {
    case 'queued':
      return `Waiting to push to ${crmLabel}`
    case 'processing':
      return `Pushing to ${crmLabel}`
    case 'succeeded':
      return `Pushed to ${crmLabel}`
    case 'failed':
      return `Failed: ${lead.crmPushLastError ?? 'CRM push needs attention'}`
    default:
      if (lead.status === 'pushed_to_crm') return `Pushed to ${crmLabel}`
      return 'Not queued for CRM yet'
  }
}

function getStatusBadgeClasses(lead: Lead) {
  if (lead.crmPushState === 'failed') return 'border border-red-500/20 bg-red-600/20 text-red-300'
  if (lead.crmPushState === 'queued' || lead.crmPushState === 'processing') {
    return 'border border-amber-500/20 bg-amber-500/15 text-amber-200'
  }
  if (lead.crmPushState === 'succeeded' || lead.status === 'pushed_to_crm') {
    return 'border border-emerald-500/20 bg-emerald-600/20 text-emerald-200'
  }
  if (isReviewable(lead)) return 'border border-sky-500/20 bg-sky-500/15 text-sky-200'
  if (lead.status === 'rejected') return 'border border-gray-700 bg-gray-800 text-gray-300'
  return 'border border-gray-700 bg-gray-800 text-gray-300'
}

function formatRelativeDate(value: string | null) {
  if (!value) return 'N/A'
  return new Date(value).toLocaleString()
}

function formatLastContactIndicator() {
  return 'No known prior contact'
}

function summarizeErrors(errors: BulkErrorSummary[] | string[] | undefined) {
  if (!errors || errors.length === 0) return null
  if (typeof errors[0] === 'string') {
    return (errors as string[]).join(' ')
  }
  return (errors as BulkErrorSummary[])
    .map((error) => `${error.message}${error.count > 1 ? ` (${error.count})` : ''}`)
    .join(' ')
}

function syncLeadFromResponse(currentLead: Lead, lead: SerializedLeadActionResponse): Lead {
  return {
    ...currentLead,
    status: lead.status,
    crmPushState: lead.crmPushState,
    crmPushLastError: lead.crmPushLastError,
    approvedAt: lead.approvedAt,
    approvedBy: lead.approvedBy,
    crmLeadId: lead.crmLeadId,
  }
}

export function LeadsClient({
  initialLeads,
  crmType,
  crmHealth,
  initialView = 'all',
}: LeadsClientProps) {
  const router = useRouter()
  const [leads, setLeads] = useState(initialLeads)
  const [viewFilter, setViewFilter] = useState<LeadView>(initialView)
  const [gradeFilter, setGradeFilter] = useState<string | null>(null)
  const [selectedReviewGrades, setSelectedReviewGrades] = useState<string[]>(['A+'])
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actingLeadId, setActingLeadId] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isRefreshing, startTransition] = useTransition()

  useEffect(() => {
    setLeads(initialLeads)
  }, [initialLeads])

  useEffect(() => {
    setViewFilter(initialView)
  }, [initialView])

  const crmLabel = getCrmLabel(crmType)

  const viewCounts = useMemo(() => {
    return leads.reduce<Record<LeadView, number>>(
      (acc, lead) => {
        acc.all += 1
        acc[getLeadView(lead)] += 1
        return acc
      },
      { all: 0, review: 0, waiting: 0, failed: 0, pushed: 0 },
    )
  }, [leads])

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return leads.filter((lead) => {
      if (viewFilter !== 'all' && getLeadView(lead) !== viewFilter) return false
      if (gradeFilter && lead.fulcrumGrade !== gradeFilter) return false
      if (!normalizedQuery) return true

      return [lead.fullName, lead.title ?? '', lead.company ?? '']
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    })
  }, [gradeFilter, leads, query, viewFilter])

  function refreshLeads() {
    startTransition(() => {
      router.refresh()
    })
  }

  function toggleReviewGrade(grade: string) {
    setSelectedReviewGrades((current) =>
      current.includes(grade) ? current.filter((value) => value !== grade) : [...current, grade],
    )
  }

  async function updateLeadStatus(leadId: string, payload: LeadActionPayload) {
    setActingLeadId(leadId)
    setFeedback(null)

    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json().catch(() => null)
      if (!response.ok) {
        setFeedback(result?.error ?? 'Lead action failed. Try again.')
        return
      }

      setLeads((current) =>
        current.map((lead) =>
          lead.id === leadId ? syncLeadFromResponse(lead, result.lead as SerializedLeadActionResponse) : lead,
        ),
      )
      setFeedback(result.message ?? null)
      refreshLeads()
    } catch {
      setFeedback('Lead action failed. Try again.')
    } finally {
      setActingLeadId(null)
    }
  }

  async function retryLeadCrmPush(leadId: string) {
    setActingLeadId(leadId)
    setFeedback(null)

    try {
      const response = await fetch(`/api/leads/${leadId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry_crm_push' }),
      })

      const result = await response.json().catch(() => null)
      if (!response.ok) {
        setFeedback(result?.error ?? 'CRM retry failed. Try again.')
        return
      }

      setLeads((current) =>
        current.map((lead) =>
          lead.id === leadId ? syncLeadFromResponse(lead, result.lead as SerializedLeadActionResponse) : lead,
        ),
      )
      setFeedback(result.message ?? null)
      refreshLeads()
    } catch {
      setFeedback('CRM retry failed. Try again.')
    } finally {
      setActingLeadId(null)
    }
  }

  async function retryFailedPushes() {
    if (!window.confirm('Retry all failed CRM pushes for this tenant?')) return

    setPendingAction('retry_failed_crm_pushes')
    setFeedback(null)

    try {
      const response = await fetch('/api/leads/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry_failed_crm_pushes' }),
      })

      const result = await response.json().catch(() => null)
      if (!response.ok) {
        setFeedback(result?.error ?? 'Bulk CRM retry failed. Try again.')
        return
      }

      const errorSummary = summarizeErrors(result?.errors as BulkErrorSummary[] | undefined)
      setFeedback(errorSummary ? `${result.message} ${errorSummary}` : result.message ?? null)
      refreshLeads()
    } catch {
      setFeedback('Bulk CRM retry failed. Try again.')
    } finally {
      setPendingAction(null)
    }
  }

  async function setCrmPauseState(action: 'pause_crm_push' | 'unpause_crm_push') {
    if (action === 'pause_crm_push' && !window.confirm('Pause CRM push for this tenant?')) return

    setPendingAction(action)
    setFeedback(null)

    try {
      const response = await fetch('/api/settings/crm/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })

      const result = await response.json().catch(() => null)
      if (!response.ok) {
        setFeedback(result?.error ?? 'CRM queue action failed. Try again.')
        return
      }

      setFeedback(result.message ?? null)
      refreshLeads()
    } catch {
      setFeedback('CRM queue action failed. Try again.')
    } finally {
      setPendingAction(null)
    }
  }

  async function bulkApproveSelectedGrades() {
    if (selectedReviewGrades.length === 0) {
      setFeedback('Select at least one grade before approving.')
      return
    }

    if (
      !window.confirm(
        `Approve all review-queue leads in grades: ${selectedReviewGrades.join(', ')}?`,
      )
    ) {
      return
    }

    setPendingAction('bulk_approve_by_grade')
    setFeedback(null)

    try {
      const response = await fetch('/api/leads/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_approve_by_grade',
          grades: selectedReviewGrades,
        }),
      })

      const result = await response.json().catch(() => null)
      if (!response.ok) {
        setFeedback(result?.error ?? 'Bulk approval failed. Try again.')
        return
      }

      const details =
        result.failedPreflight > 0
          ? ` ${result.failedPreflight} lead${result.failedPreflight === 1 ? '' : 's'} still failed CRM preflight.`
          : ''
      const errorSummary = summarizeErrors(result?.errors as string[] | undefined)
      setFeedback(
        `${result.message ?? 'Bulk approval complete.'}${details}${errorSummary ? ` ${errorSummary}` : ''}`,
      )
      refreshLeads()
    } catch {
      setFeedback('Bulk approval failed. Try again.')
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Leads</h1>
            <p className="text-sm text-gray-400">
              Review, approve, and monitor CRM push state without leaving the queue.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm text-gray-300 sm:grid-cols-4">
            <MetricCard label="Review Queue" value={String(viewCounts.review)} />
            <MetricCard label="Waiting to Push" value={String(viewCounts.waiting)} />
            <MetricCard label="Failed to Push" value={String(viewCounts.failed)} />
            <MetricCard label={`Pushed to ${crmLabel}`} value={String(viewCounts.pushed)} />
          </div>
        </div>

        <div className={`mb-6 rounded-2xl border px-4 py-4 ${CRM_HEALTH_STYLES[crmHealth.level]}`}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-sm font-semibold">CRM Health</p>
              <p className="mt-1 text-sm">{crmHealth.message}</p>
              <p className="mt-1 text-xs text-current/75">{crmHealth.action}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs text-current/85 sm:min-w-[240px]">
              <span>Queued: {crmHealth.queuedCount}</span>
              <span>Failed: {crmHealth.failedCount}</span>
              <span>Oldest queued: {crmHealth.oldestQueuedMinutes ?? 0} min</span>
              <span>Dupes 30d: {crmHealth.duplicateRate30d}%</span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              disabled={pendingAction === 'pause_crm_push' || pendingAction === 'unpause_crm_push' || isRefreshing}
              onClick={() =>
                setCrmPauseState(crmHealth.paused ? 'unpause_crm_push' : 'pause_crm_push')
              }
              className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingAction === 'pause_crm_push' || pendingAction === 'unpause_crm_push'
                ? 'Working...'
                : crmHealth.paused
                  ? 'Resume CRM Push'
                  : 'Pause CRM Push'}
            </button>
            {crmHealth.failedCount > 0 ? (
              <button
                disabled={pendingAction === 'retry_failed_crm_pushes' || isRefreshing}
                onClick={retryFailedPushes}
                className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === 'retry_failed_crm_pushes' ? 'Working...' : 'Retry Failed Pushes'}
              </button>
            ) : null}
            <Link
              href="/leads?view=failed"
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white/90 transition hover:bg-white/10"
            >
              Open Failed Queue
            </Link>
            <Link
              href="/leads?view=waiting"
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white/90 transition hover:bg-white/10"
            >
              Open Waiting Queue
            </Link>
            <Link
              href="/settings"
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white/90 transition hover:bg-white/10"
            >
              Fix CRM Settings
            </Link>
          </div>
        </div>

        {feedback ? (
          <div className="mb-4 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-200">
            {feedback}
          </div>
        ) : null}

        <section className="mb-6 rounded-2xl border border-gray-800 bg-gray-900 px-4 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Review Queue Actions</p>
              <p className="mt-1 text-sm text-gray-400">
                Approves all tenant review-queue leads in the selected grades.
              </p>
            </div>
            <button
              disabled={
                pendingAction === 'bulk_approve_by_grade' ||
                selectedReviewGrades.length === 0 ||
                viewCounts.review === 0 ||
                isRefreshing
              }
              onClick={bulkApproveSelectedGrades}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingAction === 'bulk_approve_by_grade' ? 'Working...' : 'Approve Selected Grades'}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {GRADE_OPTIONS.map((grade) => {
              const selected = selectedReviewGrades.includes(grade)
              return (
                <button
                  key={grade}
                  onClick={() => toggleReviewGrade(grade)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    selected ? 'bg-brand-cyan text-white' : 'bg-gray-950 text-gray-400 hover:text-white'
                  }`}
                >
                  {grade}
                </button>
              )
            })}
          </div>
        </section>

        <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
              Search leads
            </label>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, title, or company"
              className="w-full rounded-xl border border-gray-800 bg-gray-900 px-4 py-2.5 text-sm text-white outline-none ring-0 transition focus:border-brand-cyan"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
              Grade
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setGradeFilter(null)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  gradeFilter === null
                    ? 'bg-brand-cyan text-white'
                    : 'bg-gray-900 text-gray-400 hover:text-white'
                }`}
              >
                All Grades
              </button>
              {GRADE_OPTIONS.map((grade) => (
                <button
                  key={grade}
                  onClick={() => setGradeFilter(gradeFilter === grade ? null : grade)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    gradeFilter === grade
                      ? 'bg-brand-cyan text-white'
                      : 'bg-gray-900 text-gray-400 hover:text-white'
                  }`}
                >
                  {grade}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {(Object.keys(VIEW_LABELS) as LeadView[]).map((view) => (
            <button
              key={view}
              onClick={() => setViewFilter(view)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                viewFilter === view
                  ? 'bg-white text-gray-950'
                  : 'bg-gray-900 text-gray-400 hover:text-white'
              }`}
            >
              {VIEW_LABELS[view]} ({viewCounts[view]})
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {filtered.length > 0 ? (
            filtered.map((lead) => {
              const expanded = expandedId === lead.id
              const crmStatusLabel = getCrmStatusLabel(lead, crmLabel)

              return (
                <article key={lead.id} className="rounded-2xl border border-gray-800 bg-gray-900">
                  <button
                    onClick={() => setExpandedId(expanded ? null : lead.id)}
                    className="flex w-full flex-col gap-4 p-4 text-left sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-base font-semibold text-white">{lead.fullName}</p>
                        <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-300">
                          {lead.fulcrumGrade ?? 'Unscored'}
                        </span>
                        <span className="text-sm font-semibold text-brand-cyan">{lead.fulcrumScore}</span>
                      </div>
                      <p className="mt-1 text-sm text-gray-300">
                        {lead.title ?? 'Unknown title'} at {lead.company ?? 'Unknown company'}
                      </p>
                      <div className="mt-2 grid gap-1 text-xs text-gray-500 sm:grid-cols-2 xl:grid-cols-4">
                        <span>Fit {lead.fitScore}/40</span>
                        <span>Intent {lead.intentScore}/60</span>
                        <span>{formatLastContactIndicator()}</span>
                        <span>{lead.location ?? 'Location unavailable'}</span>
                      </div>
                      {lead.firstLine ? (
                        <p className="mt-3 line-clamp-2 text-sm text-gray-400">{lead.firstLine}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                      <span className={`rounded-full px-2.5 py-1 text-xs ${getStatusBadgeClasses(lead)}`}>
                        {crmStatusLabel}
                      </span>
                      <span className="text-xs text-gray-500">
                        Discovered {formatRelativeDate(lead.discoveredAt)}
                      </span>
                    </div>
                  </button>

                  {expanded ? (
                    <div className="border-t border-gray-800 px-4 py-4">
                      <div className="grid gap-4 text-sm text-gray-300 lg:grid-cols-2">
                        <div className="space-y-2">
                          <DetailRow label="Review Status" value={lead.status.replace(/_/g, ' ')} />
                          <DetailRow label="CRM Status" value={crmStatusLabel} />
                          <DetailRow label="Approved At" value={formatRelativeDate(lead.approvedAt)} />
                          <DetailRow label="Approved By" value={lead.approvedBy ?? 'Not approved yet'} />
                          <DetailRow label="CRM Attempts" value={String(lead.crmPushAttempts)} />
                        </div>
                        <div className="space-y-2">
                          <DetailRow label="Linked CRM Record" value={lead.crmLeadId ?? 'None yet'} />
                          <DetailRow label="Pushed At" value={formatRelativeDate(lead.pushedToCrmAt)} />
                          <DetailRow label="Last CRM Error" value={lead.crmPushLastError ?? 'None'} />
                          <DetailRow label="LinkedIn" value={lead.linkedinUrl} isLink />
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {isReviewable(lead) ? (
                          <>
                            <button
                              disabled={actingLeadId === lead.id || isRefreshing}
                              onClick={() => updateLeadStatus(lead.id, { status: 'approved' })}
                              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {actingLeadId === lead.id ? 'Working...' : 'Approve'}
                            </button>
                            <button
                              disabled={actingLeadId === lead.id || isRefreshing}
                              onClick={() =>
                                updateLeadStatus(lead.id, {
                                  status: 'rejected',
                                  rejectionReason: 'Rejected from Dashboard review',
                                  rejectReason: 'OTHER',
                                })
                              }
                              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Reject
                            </button>
                          </>
                        ) : null}
                        {canRetryCrmPush(lead) ? (
                          <button
                            disabled={actingLeadId === lead.id || isRefreshing}
                            onClick={() => retryLeadCrmPush(lead.id)}
                            className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {actingLeadId === lead.id ? 'Working...' : 'Retry CRM Push'}
                          </button>
                        ) : null}
                        <a
                          href={lead.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-gray-700 bg-gray-950 px-4 py-2 text-sm font-medium text-gray-200 transition hover:border-gray-600 hover:bg-gray-800"
                        >
                          Open LinkedIn
                        </a>
                      </div>
                    </div>
                  ) : null}
                </article>
              )
            })
          ) : (
            <div className="rounded-2xl border border-gray-800 bg-gray-900 px-6 py-10 text-center text-sm text-gray-400">
              {viewCounts.all === 0
                ? 'No leads yet. Run onboarding, then trigger the pipeline to start building your review queue.'
                : 'No leads match the current filters.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  )
}

function DetailRow({
  label,
  value,
  isLink = false,
}: {
  label: string
  value: string
  isLink?: boolean
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      {isLink ? (
        <a href={value} target="_blank" rel="noreferrer" className="mt-1 break-all text-brand-cyan hover:underline">
          {value}
        </a>
      ) : (
        <p className="mt-1 text-gray-200">{value}</p>
      )}
    </div>
  )
}
