import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'

export async function GET(request: NextRequest) {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  const { tenant } = authResult
  const status = request.nextUrl.searchParams.get('status') ?? undefined
  const grade = request.nextUrl.searchParams.get('grade') ?? undefined
  const query = request.nextUrl.searchParams.get('q') ?? undefined
  const dateFrom = request.nextUrl.searchParams.get('dateFrom') ?? undefined
  const dateTo = request.nextUrl.searchParams.get('dateTo') ?? undefined
  const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') ?? '1'))
  const pageSize = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('pageSize') ?? '25')))

  const where = {
    tenantId: tenant.id,
    ...(status ? { status } : {}),
    ...(grade ? { fulcrumGrade: grade } : {}),
    ...(query
      ? {
          OR: [
            { fullName: { contains: query, mode: 'insensitive' as const } },
            { title: { contains: query, mode: 'insensitive' as const } },
            { company: { contains: query, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...((dateFrom || dateTo)
      ? {
          discoveredAt: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
          },
        }
      : {}),
  }

  const [total, leads] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: [{ discoveredAt: 'desc' }, { fulcrumScore: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        intentSignals: {
          orderBy: { detectedAt: 'desc' },
        },
      },
    }),
  ])

  return NextResponse.json({
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    filters: {
      status: status ?? null,
      grade: grade ?? null,
      q: query ?? null,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
    },
    leads: leads.map((lead) => ({
      id: lead.id,
      fullName: lead.fullName,
      title: lead.title,
      company: lead.company,
      location: lead.location,
      linkedinUrl: lead.linkedinUrl,
      fulcrumScore: Number(lead.fulcrumScore),
      fulcrumGrade: lead.fulcrumGrade,
      fitScore: Number(lead.fitScore),
      intentScore: Number(lead.intentScore),
      status: lead.status,
      rejectionReason: lead.rejectionReason,
      firstLine: lead.firstLine,
      scoreBreakdown: lead.scoreBreakdown,
      enrichmentData: lead.enrichmentData,
      discoveredAt: lead.discoveredAt,
      pushedToCrmAt: lead.pushedToCrmAt,
      crmLeadId: lead.crmLeadId,
      intentSignals: lead.intentSignals.map((signal) => ({
        id: signal.id,
        signalType: signal.signalType,
        signalValue: signal.signalValue,
        signalScore: Number(signal.signalScore),
        detectedAt: signal.detectedAt,
      })),
    })),
  })
}
