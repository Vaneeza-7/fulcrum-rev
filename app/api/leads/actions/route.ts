import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import { bulkApproveLeadsByGrade } from '@/lib/leads/review'
import { requeueFailedLeadsForTenant } from '@/lib/leads/crm-queue-ops'

const bulkLeadActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('bulk_approve_by_grade'),
    grades: z.array(z.string().trim().min(1)).min(1),
  }),
  z.object({
    action: z.literal('retry_failed_crm_pushes'),
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

    const parsed = bulkLeadActionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 },
      )
    }

    const actor = authResult.userId ?? 'dashboard_user'

    if (parsed.data.action === 'bulk_approve_by_grade') {
      const result = await bulkApproveLeadsByGrade({
        tenantId: authResult.tenant.id,
        grades: parsed.data.grades,
        approvedBy: actor,
      })

      return NextResponse.json({
        success: true,
        action: parsed.data.action,
        totalMatched: result.total,
        approved: result.approved,
        failedPreflight: result.failedPreflight,
        errors: result.errors,
        message: `Approved ${result.approved} lead${result.approved === 1 ? '' : 's'} across the selected grades.`,
      })
    }

    const result = await requeueFailedLeadsForTenant({
      tenantId: authResult.tenant.id,
      requestedBy: actor,
    })

    return NextResponse.json({
      success: true,
      action: parsed.data.action,
      totalMatched: result.totalMatched,
      queued: result.queued,
      stillFailed: result.stillFailed,
      errors: result.errors,
      message: `Queued ${result.queued} failed CRM push${result.queued === 1 ? '' : 'es'} for retry.`,
    })
  } catch (error) {
    console.error('bulk lead action POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
