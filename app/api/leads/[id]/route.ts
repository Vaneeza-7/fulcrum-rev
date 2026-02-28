import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
  const body = await request.json()
  const { status, rejectionReason } = body

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
}
