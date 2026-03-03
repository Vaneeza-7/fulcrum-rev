import { prisma } from '@/lib/db'
import { creditsFromProviderCostUsdMicros, formatCredits, formatUsdMicros } from './credit-rules'
import { getBillingPeriodWindow } from './manual-plans'

export interface BillingHistoryQuery {
  page?: number
  pageSize?: number
  provider?: string | null
  stage?: string | null
  billableOnly?: boolean
}

function normalizePagination(page?: number, pageSize?: number) {
  const normalizedPage = Number.isFinite(page) && page && page > 0 ? Math.floor(page) : 1
  const normalizedPageSize = Number.isFinite(pageSize) && pageSize && pageSize > 0
    ? Math.min(Math.floor(pageSize), 100)
    : 25

  return { page: normalizedPage, pageSize: normalizedPageSize, skip: (normalizedPage - 1) * normalizedPageSize }
}

export async function getTenantBillingHistory(tenantId: string, query: BillingHistoryQuery = {}) {
  const account = await prisma.tenantBillingAccount.findUnique({
    where: { tenantId },
    select: {
      currentPeriodStart: true,
      currentPeriodEnd: true,
    },
  })

  const { currentPeriodStart, currentPeriodEnd } = getBillingPeriodWindow(account)
  const { page, pageSize, skip } = normalizePagination(query.page, query.pageSize)

  const where = {
    tenantId,
    createdAt: {
      gte: currentPeriodStart,
      lt: currentPeriodEnd,
    },
    ...(query.provider ? { provider: query.provider } : {}),
    ...(query.stage ? { stage: query.stage } : {}),
    ...(query.billableOnly !== false
      ? {
          providerCostUsdMicros: { gt: 0 },
          tenantOwnedCredentialUsed: false,
        }
      : {}),
  } as const

  const [total, events] = await Promise.all([
    prisma.providerUsageEvent.count({ where }),
    prisma.providerUsageEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        createdAt: true,
        provider: true,
        stage: true,
        leadId: true,
        tenantOwnedCredentialUsed: true,
        providerCostUsdMicros: true,
        inputTokens: true,
        outputTokens: true,
        requestCount: true,
        metadata: true,
      },
    }),
  ])

  const leadIds = Array.from(new Set(events.map((event) => event.leadId).filter(Boolean))) as string[]
  const leads = leadIds.length > 0
    ? await prisma.lead.findMany({
        where: { id: { in: leadIds } },
        select: { id: true, fullName: true },
      })
    : []
  const leadMap = new Map(leads.map((lead) => [lead.id, lead.fullName]))

  return {
    page,
    pageSize,
    total,
    entries: events.map((event) => {
      const credits = creditsFromProviderCostUsdMicros(event.providerCostUsdMicros)
      const billable = event.providerCostUsdMicros > 0 && !event.tenantOwnedCredentialUsed
      return {
        id: event.id,
        createdAt: event.createdAt.toISOString(),
        provider: event.provider,
        stage: event.stage,
        credits: formatCredits(credits),
        providerCostUsd: formatUsdMicros(event.providerCostUsdMicros),
        projectedBillableUsd: formatUsdMicros(event.providerCostUsdMicros * 3),
        leadId: event.leadId,
        leadName: event.leadId ? leadMap.get(event.leadId) ?? null : null,
        tenantOwnedCredentialUsed: event.tenantOwnedCredentialUsed,
        billable,
        usage: {
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          requestCount: event.requestCount,
          searchQueries:
            typeof (event.metadata as Record<string, unknown> | null)?.searchQueries === 'number'
              ? Number((event.metadata as Record<string, unknown>).searchQueries)
              : undefined,
        },
      }
    }),
  }
}
