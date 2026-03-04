import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import {
  pauseTenantCrmPush,
  unpauseTenantCrmPush,
} from '@/lib/leads/crm-queue-ops'

const crmActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('pause_crm_push'),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal('unpause_crm_push'),
  }),
])

export async function POST(request: Request) {
  try {
    const authResult = await getAuthenticatedTenant()
    if ('error' in authResult) return authResult.error

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = crmActionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 },
      )
    }

    const actor = authResult.userId ?? 'dashboard_user'
    const result =
      parsed.data.action === 'pause_crm_push'
        ? await pauseTenantCrmPush({
            tenantId: authResult.tenant.id,
            reason: parsed.data.reason,
            requestedBy: actor,
          })
        : await unpauseTenantCrmPush({
            tenantId: authResult.tenant.id,
            requestedBy: actor,
          })

    return NextResponse.json({
      success: true,
      paused: result.paused,
      pauseReason: result.pauseReason,
      pausedAt: result.pausedAt?.toISOString() ?? null,
      message: result.message,
    })
  } catch (error) {
    console.error('settings/crm action POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
