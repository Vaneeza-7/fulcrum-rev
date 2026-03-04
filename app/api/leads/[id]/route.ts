import { NextResponse } from 'next/server'
import { z } from 'zod'
import { NegativeReason } from '@prisma/client'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import { prisma } from '@/lib/db'
import {
  approveLeadForCrmQueue,
  rejectLeadFromReview,
  REVIEWABLE_LEAD_STATUSES,
} from '@/lib/leads/review'
import { serializeLeadActionSnapshot } from '@/lib/leads/crm-queue-ops'

const patchLeadSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  rejectionReason: z.string().trim().max(500).optional(),
  rejectReason: z.nativeEnum(NegativeReason).optional(),
})

export async function PATCH(
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

    const parsed = patchLeadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 },
      )
    }

    const lead = await prisma.lead.findFirst({
      where: { id, tenantId: tenant.id },
      select: { status: true },
    })

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if (
      !REVIEWABLE_LEAD_STATUSES.has(lead.status) &&
      !(
        parsed.data.status === 'approved' &&
        (lead.status === 'approved' || lead.status === 'pushed_to_crm')
      ) &&
      !(parsed.data.status === 'rejected' && lead.status === 'rejected')
    ) {
      return NextResponse.json(
        { error: `Lead cannot be updated from status ${lead.status}` },
        { status: 409 },
      )
    }

    const actor = userId ?? 'dashboard_user'

    if (parsed.data.status === 'approved') {
      const result = await approveLeadForCrmQueue({
        tenantId: tenant.id,
        leadId: id,
        approvedBy: actor,
      })

      return NextResponse.json({
        success: true,
        message: result.message,
        lead: serializeLeadActionSnapshot(result.lead),
      })
    }

    const result = await rejectLeadFromReview({
      tenantId: tenant.id,
      leadId: id,
      rejectionReason: parsed.data.rejectionReason,
      rejectReason: parsed.data.rejectReason,
      rejectedBy: actor,
    })

    return NextResponse.json({
      success: true,
      message: result.message,
      lead: serializeLeadActionSnapshot(result.lead),
    })
  } catch (error) {
    console.error('lead PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
