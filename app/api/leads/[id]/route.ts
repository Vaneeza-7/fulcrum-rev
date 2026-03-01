import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const VALID_STATUSES = new Set([
  'new',
  'contacted',
  'qualified',
  'converted',
  'rejected',
  'nurturing',
])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId } = await auth()
    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
    })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const { id } = await params

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { status, rejectionReason } = body

    // Validate status against whitelist
    if (status && !VALID_STATUSES.has(status as string)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${[...VALID_STATUSES].join(', ')}` },
        { status: 400 }
      )
    }

    // Verify the lead belongs to this tenant
    const lead = await prisma.lead.findFirst({
      where: { id, tenantId: tenant.id },
    })
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    if (status) updateData.status = status
    if (rejectionReason) updateData.rejectionReason = rejectionReason

    const updated = await prisma.lead.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ success: true, lead: { id: updated.id, status: updated.status } })
  } catch (error) {
    console.error('lead PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
