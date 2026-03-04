import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import { CRM_PUSH_EVENT_OUTCOMES, CRM_PUSH_EVENT_WINDOWS } from '@/lib/crm/push-events'
import { listTenantCrmPushEvents } from '@/lib/crm/push-events-service'

const querySchema = z.object({
  leadId: z.string().uuid().optional(),
  outcome: z.enum(CRM_PUSH_EVENT_OUTCOMES).optional(),
  errorCode: z.string().trim().min(1).max(100).optional(),
  window: z.enum(CRM_PUSH_EVENT_WINDOWS).default('7d'),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(25),
})

export async function GET(request: NextRequest) {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  const parsed = querySchema.safeParse({
    leadId: request.nextUrl.searchParams.get('leadId') ?? undefined,
    outcome: request.nextUrl.searchParams.get('outcome') ?? undefined,
    errorCode: request.nextUrl.searchParams.get('errorCode') ?? undefined,
    window: request.nextUrl.searchParams.get('window') ?? undefined,
    q: request.nextUrl.searchParams.get('q') ?? undefined,
    page: request.nextUrl.searchParams.get('page') ?? undefined,
    pageSize: request.nextUrl.searchParams.get('pageSize') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const response = await listTenantCrmPushEvents({
    tenantId: authResult.tenant.id,
    filters: {
      leadId: parsed.data.leadId ?? null,
      outcome: parsed.data.outcome ?? null,
      errorCode: parsed.data.errorCode ?? null,
      window: parsed.data.window,
      q: parsed.data.q ?? null,
    },
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  })

  return NextResponse.json(response)
}
