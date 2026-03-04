import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import { listLeadCrmPushEvents } from '@/lib/crm/push-events-service'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  const parsed = querySchema.safeParse({
    limit: request.nextUrl.searchParams.get('limit') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { id } = await params

  const lead = await prisma.lead.findFirst({
    where: {
      id,
      tenantId: authResult.tenant.id,
    },
    select: { id: true },
  })

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  const events = await listLeadCrmPushEvents({
    tenantId: authResult.tenant.id,
    leadId: id,
    limit: parsed.data.limit,
  })

  return NextResponse.json({
    leadId: id,
    events,
  })
}
