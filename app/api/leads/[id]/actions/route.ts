import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import {
  requeueLeadForCrmPush,
  serializeLeadActionSnapshot,
} from '@/lib/leads/crm-queue-ops'

const leadActionSchema = z.object({
  action: z.literal('retry_crm_push'),
})

function statusForLeadActionError(message: string) {
  if (message.includes('Lead not found')) return 404
  if (message.includes('cannot be retried') || message.includes('already been pushed')) return 409
  return 500
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await getAuthenticatedTenant()
    if ('error' in authResult) return authResult.error

    const { tenant, userId } = authResult
    const { id } = await params

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = leadActionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 },
      )
    }

    const result = await requeueLeadForCrmPush({
      tenantId: tenant.id,
      leadId: id,
      requestedBy: userId ?? 'dashboard_user',
    })

    return NextResponse.json({
      success: true,
      message: result.message,
      lead: serializeLeadActionSnapshot(result.lead),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = error instanceof Error ? statusForLeadActionError(error.message) : 500

    if (status === 500) {
      console.error('lead action POST error:', error)
    }

    return NextResponse.json({ error: message }, { status })
  }
}
