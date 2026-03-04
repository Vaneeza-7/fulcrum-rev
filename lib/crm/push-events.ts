export const CRM_PUSH_EVENT_WINDOWS = ['24h', '7d', '30d'] as const

export type CrmPushEventWindow = (typeof CRM_PUSH_EVENT_WINDOWS)[number]

export const CRM_PUSH_EVENT_OUTCOMES = [
  'created',
  'matched_existing',
  'duplicate_detected',
  'auth_failed',
  'validation_failed',
  'transient_failed',
  'other',
] as const

export type CrmPushEventOutcome = (typeof CRM_PUSH_EVENT_OUTCOMES)[number]

export interface CrmPushEventMetadata {
  stage?: 'preflight' | 'push'
  rawError?: string
  retry?: number
  source?: 'cron'
  duplicateHint?: string | null
}

export interface CrmPushEventListItem {
  id: string
  tenantId: string
  leadId: string
  leadName: string
  company: string | null
  connector: string
  outcome: CrmPushEventOutcome
  rawOutcome: string
  crmObjectId: string | null
  attemptNumber: number
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  metadata: CrmPushEventMetadata
}

export interface CrmPushEventFilters {
  leadId?: string | null
  outcome?: CrmPushEventOutcome | null
  errorCode?: string | null
  window: CrmPushEventWindow
  q?: string | null
}

export interface CrmPushEventListResponse {
  page: number
  pageSize: number
  total: number
  totalPages: number
  filters: {
    leadId: string | null
    outcome: CrmPushEventOutcome | null
    errorCode: string | null
    window: CrmPushEventWindow
    q: string | null
  }
  events: CrmPushEventListItem[]
}

export interface CrmPushEventSummary {
  window: CrmPushEventWindow
  totals: {
    created: number
    duplicates: number
    authFailed: number
    validationFailed: number
    transientFailed: number
    matchedExisting: number
    other: number
  }
  duplicateRate: string
  oldestFailedMinutes: number | null
  topDuplicateLeads: Array<{
    leadId: string
    leadName: string
    company: string | null
    duplicateCount: number
  }>
  recentDuplicates: CrmPushEventListItem[]
}

const KNOWN_DB_OUTCOMES = new Set<string>(CRM_PUSH_EVENT_OUTCOMES.filter((value) => value !== 'other'))

export function normalizeCrmPushEventOutcome(
  rawOutcome: string | null | undefined,
): CrmPushEventOutcome {
  if (!rawOutcome) return 'other'
  if (KNOWN_DB_OUTCOMES.has(rawOutcome)) {
    return rawOutcome as Exclude<CrmPushEventOutcome, 'other'>
  }
  return 'other'
}

export function parseCrmPushEventWindow(
  value: string | null | undefined,
  fallback: CrmPushEventWindow = '7d',
): CrmPushEventWindow {
  if (value && CRM_PUSH_EVENT_WINDOWS.includes(value as CrmPushEventWindow)) {
    return value as CrmPushEventWindow
  }
  return fallback
}

export function getCrmPushEventWindowStart(window: CrmPushEventWindow, now = new Date()) {
  const durationMs =
    window === '24h' ? 24 * 60 * 60_000 : window === '7d' ? 7 * 24 * 60 * 60_000 : 30 * 24 * 60 * 60_000
  return new Date(now.getTime() - durationMs)
}

export function formatCrmPushDuplicateRate(duplicates: number, total: number) {
  if (total <= 0) return '0.00'
  return ((duplicates / total) * 100).toFixed(2)
}

export function isCrmPushFailureOutcome(outcome: CrmPushEventOutcome) {
  return (
    outcome === 'auth_failed' ||
    outcome === 'validation_failed' ||
    outcome === 'transient_failed' ||
    outcome === 'other'
  )
}
