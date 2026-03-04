'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import type {
  CrmPushEventListItem,
  CrmPushEventListResponse,
  CrmPushEventOutcome,
  CrmPushEventSummary,
  CrmPushEventWindow,
} from '@/lib/crm/push-events'
import { CRM_PUSH_EVENT_WINDOWS } from '@/lib/crm/push-events'

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
  oldestFailedMinutes: number | null
  duplicateRate30d: string
  paused: boolean
  message: string
  action: string
}

interface LeadsClientProps {
  initialLeads: Lead[]
  crmType: string | null
  crmHealth: CrmHealth
  initialCrmActivitySummary: CrmPushEventSummary
  initialCrmActivityFeed: CrmPushEventListResponse
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

interface LeadEventHistoryState {
  loading: boolean
  events: CrmPushEventListItem[]
  error: string | null
}

interface LeadActivityFilter {
  id: string
  label: string
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

const CRM_EVENT_BADGE_STYLES: Record<CrmPushEventOutcome, string> = {
  created: 'border border-emerald-500/20 bg-emerald-600/20 text-emerald-200',
  matched_existing: 'border border-sky-500/20 bg-sky-500/15 text-sky-200',
  duplicate_detected: 'border border-amber-500/20 bg-amber-500/15 text-amber-200',
  auth_failed: 'border border-red-500/20 bg-red-600/20 text-red-300',
  validation_failed: 'border border-orange-500/20 bg-orange-500/15 text-orange-200',
  transient_failed: 'border border-fuchsia-500/20 bg-fuchsia-500/15 text-fuchsia-200',
  other: 'border border-gray-700 bg-gray-800 text-gray-300',
}

const CRM_ACTIVITY_WINDOW_LABELS: Record<CrmPushEventWindow, string> = {
  '24h': '24h',
  '7d': '7d',
  '30d': '30d',
}

const CRM_ACTIVITY_OUTCOME_FILTERS: Array<{
  label: string
  value: CrmPushEventOutcome | null
}> = [
  { label: 'All', value: null },
  { label: 'Created', value: 'created' },
  { label: 'Duplicate', value: 'duplicate_detected' },
  { label: 'Auth', value: 'auth_failed' },
  { label: 'Validation', value: 'validation_failed' },
  { label: 'Transient', value: 'transient_failed' },
]

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

export function shouldLoadLeadCrmActivity(lead: Lead) {
  return (
    lead.crmPushAttempts > 0 ||
    Boolean(lead.crmLeadId) ||
    ['failed', 'queued', 'processing', 'succeeded'].includes(lead.crmPushState)
  )
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

function formatCrmEventOutcomeLabel(outcome: CrmPushEventOutcome) {
  switch (outcome) {
    case 'created':
      return 'Created'
    case 'matched_existing':
      return 'Matched Existing'
    case 'duplicate_detected':
      return 'Duplicate'
    case 'auth_failed':
      return 'Auth Failed'
    case 'validation_failed':
      return 'Validation Failed'
    case 'transient_failed':
      return 'Transient Failed'
    default:
      return 'Other'
  }
}

function buildCrmActivityQueryString(input: {
  window: CrmPushEventWindow
  outcome: CrmPushEventOutcome | null
  q: string
  page: number
  pageSize: number
  leadId: string | null
}) {
  const params = new URLSearchParams()
  params.set('window', input.window)
  params.set('page', String(input.page))
  params.set('pageSize', String(input.pageSize))
  if (input.outcome) params.set('outcome', input.outcome)
  if (input.q.trim()) params.set('q', input.q.trim())
  if (input.leadId) params.set('leadId', input.leadId)
  return params.toString()
}

export function LeadsClient({
  initialLeads,
  crmType,
  crmHealth,
  initialCrmActivitySummary,
  initialCrmActivityFeed,
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
  const [crmEventWindow, setCrmEventWindow] = useState<CrmPushEventWindow>(
    initialCrmActivitySummary.window,
  )
  const [crmEventOutcomeFilter, setCrmEventOutcomeFilter] = useState<CrmPushEventOutcome | null>(
    initialCrmActivityFeed.filters.outcome ?? null,
  )
  const [crmEventQuery, setCrmEventQuery] = useState(initialCrmActivityFeed.filters.q ?? '')
  const [crmEventsPage, setCrmEventsPage] = useState(initialCrmActivityFeed.page)
  const [crmEvents, setCrmEvents] = useState(initialCrmActivityFeed.events)
  const [crmEventsTotalPages, setCrmEventsTotalPages] = useState(initialCrmActivityFeed.totalPages)
  const [crmEventSummary, setCrmEventSummary] = useState(initialCrmActivitySummary)
  const [crmEventLeadFilter, setCrmEventLeadFilter] = useState<LeadActivityFilter | null>(null)
  const [crmActivityRefreshNonce, setCrmActivityRefreshNonce] = useState(0)
  const [crmEventFeedLoading, setCrmEventFeedLoading] = useState(false)
  const [crmEventSummaryLoading, setCrmEventSummaryLoading] = useState(false)
  const [crmEventError, setCrmEventError] = useState<string | null>(null)
  const [leadEventHistoryByLeadId, setLeadEventHistoryByLeadId] = useState<
    Record<string, LeadEventHistoryState>
  >({})
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

  useEffect(() => {
    let ignore = false
    const controller = new AbortController()

    async function loadCrmActivitySummary() {
      setCrmEventSummaryLoading(true)

      try {
        const response = await fetch(`/api/crm/push-events/summary?window=${crmEventWindow}`, {
          signal: controller.signal,
        })
        const result = await response.json().catch(() => null)

        if (!response.ok) {
          if (!ignore) {
            setCrmEventError(result?.error ?? 'Failed to load CRM activity summary.')
          }
          return
        }

        if (!ignore) {
          setCrmEventSummary(result as CrmPushEventSummary)
        }
      } catch (error) {
        if (!ignore && (!(error instanceof Error) || error.name !== 'AbortError')) {
          setCrmEventError('Failed to load CRM activity summary.')
        }
      } finally {
        if (!ignore) {
          setCrmEventSummaryLoading(false)
        }
      }
    }

    loadCrmActivitySummary()

    return () => {
      ignore = true
      controller.abort()
    }
  }, [crmActivityRefreshNonce, crmEventWindow])

  useEffect(() => {
    let ignore = false
    const controller = new AbortController()

    async function loadCrmEvents() {
      setCrmEventFeedLoading(true)

      try {
        const queryString = buildCrmActivityQueryString({
          window: crmEventWindow,
          outcome: crmEventOutcomeFilter,
          q: crmEventQuery,
          page: crmEventsPage,
          pageSize: 25,
          leadId: crmEventLeadFilter?.id ?? null,
        })
        const response = await fetch(`/api/crm/push-events?${queryString}`, {
          signal: controller.signal,
        })
        const result = await response.json().catch(() => null)

        if (!response.ok) {
          if (!ignore) {
            setCrmEventError(result?.error ?? 'Failed to load CRM activity.')
          }
          return
        }

        if (!ignore) {
          const payload = result as CrmPushEventListResponse
          setCrmEvents(payload.events)
          setCrmEventsTotalPages(payload.totalPages)
          setCrmEventError(null)
        }
      } catch (error) {
        if (!ignore && (!(error instanceof Error) || error.name !== 'AbortError')) {
          setCrmEventError('Failed to load CRM activity.')
        }
      } finally {
        if (!ignore) {
          setCrmEventFeedLoading(false)
        }
      }
    }

    loadCrmEvents()

    return () => {
      ignore = true
      controller.abort()
    }
  }, [
    crmActivityRefreshNonce,
    crmEventLeadFilter?.id,
    crmEventOutcomeFilter,
    crmEventQuery,
    crmEventWindow,
    crmEventsPage,
  ])

  useEffect(() => {
    if (!expandedId) return

    const lead = leads.find((candidate) => candidate.id === expandedId)
    if (!lead || !shouldLoadLeadCrmActivity(lead) || leadEventHistoryByLeadId[lead.id]) {
      return
    }
    const leadId = lead.id

    let ignore = false
    const controller = new AbortController()

    setLeadEventHistoryByLeadId((current) => ({
      ...current,
      [leadId]: {
        loading: true,
        events: [],
        error: null,
      },
    }))

    async function loadLeadActivity() {
      try {
        const response = await fetch(`/api/leads/${leadId}/crm-push-events?limit=5`, {
          signal: controller.signal,
        })
        const result = await response.json().catch(() => null)

        if (!response.ok) {
          if (!ignore) {
            setLeadEventHistoryByLeadId((current) => ({
              ...current,
              [leadId]: {
                loading: false,
                events: [],
                error: result?.error ?? 'Failed to load lead CRM activity.',
              },
            }))
          }
          return
        }

        if (!ignore) {
          setLeadEventHistoryByLeadId((current) => ({
            ...current,
            [leadId]: {
              loading: false,
              events: (result?.events ?? []) as CrmPushEventListItem[],
              error: null,
            },
          }))
        }
      } catch (error) {
        if (!ignore && (!(error instanceof Error) || error.name !== 'AbortError')) {
          setLeadEventHistoryByLeadId((current) => ({
            ...current,
            [leadId]: {
              loading: false,
              events: [],
              error: 'Failed to load lead CRM activity.',
            },
          }))
        }
      }
    }

    loadLeadActivity()

    return () => {
      ignore = true
      controller.abort()
    }
  }, [expandedId, leadEventHistoryByLeadId, leads])

  function refreshLeadSlice(options?: { invalidateLeadId?: string; clearAllLeadActivity?: boolean }) {
    if (options?.clearAllLeadActivity) {
      setLeadEventHistoryByLeadId({})
    } else if (options?.invalidateLeadId) {
      setLeadEventHistoryByLeadId((current) => {
        const next = { ...current }
        delete next[options.invalidateLeadId!]
        return next
      })
    }

    setCrmActivityRefreshNonce((current) => current + 1)
    startTransition(() => {
      router.refresh()
    })
  }

  function toggleReviewGrade(grade: string) {
    setSelectedReviewGrades((current) =>
      current.includes(grade) ? current.filter((value) => value !== grade) : [...current, grade],
    )
  }

  function openLeadFromActivity(leadId: string) {
    setViewFilter('all')
    setGradeFilter(null)
    setQuery('')
    setExpandedId(leadId)

    setTimeout(() => {
      document.getElementById(`lead-card-${leadId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 0)
  }

  function filterActivityToLead(event: CrmPushEventListItem) {
    setCrmEventLeadFilter({
      id: event.leadId,
      label: event.leadName,
    })
    setCrmEventsPage(1)
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
      refreshLeadSlice({ invalidateLeadId: leadId })
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
      refreshLeadSlice({ invalidateLeadId: leadId })
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
      refreshLeadSlice({ clearAllLeadActivity: true })
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
      refreshLeadSlice({ clearAllLeadActivity: true })
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
      refreshLeadSlice({ clearAllLeadActivity: true })
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
            <div className="grid grid-cols-2 gap-3 text-xs text-current/85 sm:min-w-[320px]">
              <span>Queued: {crmHealth.queuedCount}</span>
              <span>Failed: {crmHealth.failedCount}</span>
              <span>Oldest queued: {crmHealth.oldestQueuedMinutes ?? 0} min</span>
              <span>Oldest failed: {crmHealth.oldestFailedMinutes ?? 0} min</span>
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
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">CRM Activity</p>
              <p className="mt-1 text-sm text-gray-400">
                Recent push outcomes, duplicate diagnostics, and lead-level CRM history.
              </p>
            </div>
            <div className="text-xs text-gray-500">
              {crmEventSummaryLoading ? 'Refreshing summary...' : null}
              {!crmEventSummaryLoading && crmEventFeedLoading ? 'Refreshing events...' : null}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <MetricCard
              label={`Created (${CRM_ACTIVITY_WINDOW_LABELS[crmEventWindow]})`}
              value={String(crmEventSummary.totals.created)}
            />
            <MetricCard
              label={`Duplicates (${CRM_ACTIVITY_WINDOW_LABELS[crmEventWindow]})`}
              value={String(crmEventSummary.totals.duplicates)}
            />
            <MetricCard
              label={`Auth Failures (${CRM_ACTIVITY_WINDOW_LABELS[crmEventWindow]})`}
              value={String(crmEventSummary.totals.authFailed)}
            />
            <MetricCard
              label={`Validation Failures (${CRM_ACTIVITY_WINDOW_LABELS[crmEventWindow]})`}
              value={String(crmEventSummary.totals.validationFailed)}
            />
            <MetricCard
              label={`Transient Failures (${CRM_ACTIVITY_WINDOW_LABELS[crmEventWindow]})`}
              value={String(crmEventSummary.totals.transientFailed)}
            />
            <MetricCard
              label="Oldest Failed Attempt"
              value={
                crmEventSummary.oldestFailedMinutes === null
                  ? 'None'
                  : `${crmEventSummary.oldestFailedMinutes} min`
              }
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px]">
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Search CRM activity
              </label>
              <input
                value={crmEventQuery}
                onChange={(event) => {
                  setCrmEventQuery(event.target.value)
                  setCrmEventsPage(1)
                }}
                placeholder="Filter by lead or company"
                className="w-full rounded-xl border border-gray-800 bg-gray-950 px-4 py-2.5 text-sm text-white outline-none ring-0 transition focus:border-brand-cyan"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Window
              </label>
              <select
                value={crmEventWindow}
                onChange={(event) => {
                  setCrmEventWindow(event.target.value as CrmPushEventWindow)
                  setCrmEventsPage(1)
                }}
                className="w-full rounded-xl border border-gray-800 bg-gray-950 px-4 py-2.5 text-sm text-white outline-none ring-0 transition focus:border-brand-cyan"
              >
                {CRM_PUSH_EVENT_WINDOWS.map((window) => (
                  <option key={window} value={window}>
                    {CRM_ACTIVITY_WINDOW_LABELS[window]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {CRM_ACTIVITY_OUTCOME_FILTERS.map((filterOption) => {
              const selected = crmEventOutcomeFilter === filterOption.value
              return (
                <button
                  key={filterOption.label}
                  onClick={() => {
                    setCrmEventOutcomeFilter(filterOption.value)
                    setCrmEventsPage(1)
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    selected ? 'bg-brand-cyan text-white' : 'bg-gray-950 text-gray-400 hover:text-white'
                  }`}
                >
                  {filterOption.label}
                </button>
              )
            })}
            {crmEventLeadFilter ? (
              <>
                <span className="rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-3 py-1 text-xs text-brand-cyan">
                  Lead: {crmEventLeadFilter.label}
                </span>
                <button
                  onClick={() => {
                    setCrmEventLeadFilter(null)
                    setCrmEventsPage(1)
                  }}
                  className="rounded-full bg-gray-950 px-3 py-1 text-xs font-medium text-gray-400 transition-colors hover:text-white"
                >
                  Clear Lead Filter
                </button>
              </>
            ) : null}
          </div>

          {crmEventSummary.totals.duplicates > 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-amber-100">Duplicate Diagnostics</p>
                  <p className="mt-1 text-sm text-amber-50/85">
                    Verify whether duplicate creation is legitimate replay noise before retrying or expanding the rollout.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs text-amber-50/80 sm:min-w-[220px]">
                  <span>Duplicates: {crmEventSummary.totals.duplicates}</span>
                  <span>Duplicate rate: {crmEventSummary.duplicateRate}%</span>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-amber-100/70">
                    Top Affected Leads
                  </p>
                  <div className="mt-2 space-y-2">
                    {crmEventSummary.topDuplicateLeads.length > 0 ? (
                      crmEventSummary.topDuplicateLeads.map((lead) => (
                        <div
                          key={lead.leadId}
                          className="rounded-xl border border-amber-500/10 bg-black/10 px-3 py-2 text-sm text-amber-50/85"
                        >
                          <p className="font-medium">{lead.leadName}</p>
                          <p className="text-xs text-amber-100/70">
                            {lead.company ?? 'Unknown company'} • {lead.duplicateCount} duplicates
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-amber-100/70">No duplicate leads in this window.</p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-amber-100/70">
                    Most Recent Duplicate Events
                  </p>
                  <div className="mt-2 space-y-2">
                    {crmEventSummary.recentDuplicates.length > 0 ? (
                      crmEventSummary.recentDuplicates.map((event) => (
                        <div
                          key={event.id}
                          className="rounded-xl border border-amber-500/10 bg-black/10 px-3 py-2 text-sm text-amber-50/85"
                        >
                          <p className="font-medium">{event.leadName}</p>
                          <p className="text-xs text-amber-100/70">
                            {formatRelativeDate(event.createdAt)}
                            {event.crmObjectId ? ` • ${event.crmObjectId}` : ''}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-amber-100/70">No recent duplicates in this window.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-800">
            <table className="min-w-full divide-y divide-gray-800 text-sm">
              <thead className="bg-gray-950 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3">Attempt</th>
                  <th className="px-4 py-3">CRM Object</th>
                  <th className="px-4 py-3">Error</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 bg-gray-900">
                {crmEvents.length > 0 ? (
                  crmEvents.map((event) => {
                    const leadInCurrentSlice = leads.some((lead) => lead.id === event.leadId)
                    return (
                      <tr key={event.id}>
                        <td className="px-4 py-3 text-gray-300">{formatRelativeDate(event.createdAt)}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-white">{event.leadName}</p>
                          <p className="text-xs text-gray-500">{event.company ?? 'Unknown company'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs ${CRM_EVENT_BADGE_STYLES[event.outcome]}`}
                          >
                            {formatCrmEventOutcomeLabel(event.outcome)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-300">{event.attemptNumber}</td>
                        <td className="px-4 py-3 text-gray-300">{event.crmObjectId ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-400">{event.errorMessage ?? '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              disabled={!leadInCurrentSlice}
                              onClick={() => openLeadFromActivity(event.leadId)}
                              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/90 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Open Lead
                            </button>
                            <button
                              onClick={() => filterActivityToLead(event)}
                              className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:border-gray-600 hover:bg-gray-800"
                            >
                              Filter to Lead
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                      {crmEventFeedLoading ? 'Loading CRM activity...' : 'No CRM activity matches the current filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-2 text-sm text-gray-400 sm:flex-row sm:items-center sm:justify-between">
            <p>{crmEventError ?? 'Use the event feed to spot duplicates, auth failures, and validation issues.'}</p>
            <div className="flex items-center gap-2">
              <button
                disabled={crmEventsPage <= 1 || crmEventFeedLoading}
                onClick={() => setCrmEventsPage((current) => Math.max(1, current - 1))}
                className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:border-gray-600 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-xs text-gray-500">
                Page {crmEventsPage} of {crmEventsTotalPages}
              </span>
              <button
                disabled={crmEventsPage >= crmEventsTotalPages || crmEventFeedLoading}
                onClick={() => setCrmEventsPage((current) => Math.min(crmEventsTotalPages, current + 1))}
                className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:border-gray-600 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </section>

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
              const leadActivity = leadEventHistoryByLeadId[lead.id]

              return (
                <article
                  key={lead.id}
                  id={`lead-card-${lead.id}`}
                  className="rounded-2xl border border-gray-800 bg-gray-900"
                >
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

                      {shouldLoadLeadCrmActivity(lead) ? (
                        <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-950 px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-white">Recent CRM Activity</p>
                              <p className="mt-1 text-xs text-gray-500">
                                Latest 5 CRM push events for this lead.
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 space-y-2">
                            {leadActivity?.loading ? (
                              <p className="text-sm text-gray-400">Loading CRM activity...</p>
                            ) : leadActivity?.error ? (
                              <p className="text-sm text-red-300">{leadActivity.error}</p>
                            ) : leadActivity?.events.length ? (
                              leadActivity.events.map((event) => (
                                <div
                                  key={event.id}
                                  className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-3"
                                >
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span
                                        className={`inline-flex rounded-full px-2.5 py-1 text-xs ${CRM_EVENT_BADGE_STYLES[event.outcome]}`}
                                      >
                                        {formatCrmEventOutcomeLabel(event.outcome)}
                                      </span>
                                      <span className="text-xs text-gray-500">
                                        Attempt {event.attemptNumber}
                                      </span>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                      {formatRelativeDate(event.createdAt)}
                                    </span>
                                  </div>
                                  <div className="mt-2 grid gap-2 text-sm text-gray-300 lg:grid-cols-2">
                                    <p>Error: {event.errorMessage ?? 'None'}</p>
                                    <p>CRM Object: {event.crmObjectId ?? 'None'}</p>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-gray-400">No CRM activity recorded for this lead yet.</p>
                            )}
                          </div>
                        </div>
                      ) : null}

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
    <div className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-3">
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
