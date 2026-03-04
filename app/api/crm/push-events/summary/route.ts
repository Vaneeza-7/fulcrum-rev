import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import { CRM_PUSH_EVENT_WINDOWS } from '@/lib/crm/push-events'
import { getTenantCrmPushEventSummary } from '@/lib/crm/push-events-service'

const querySchema = z.object({
  window: z.enum(CRM_PUSH_EVENT_WINDOWS).default('7d'),
})

export async function GET(request: NextRequest) {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  const parsed = querySchema.safeParse({
    window: request.nextUrl.searchParams.get('window') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const summary = await getTenantCrmPushEventSummary({
    tenantId: authResult.tenant.id,
    window: parsed.data.window,
  })

  return NextResponse.json(summary)
}
