import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
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

  const body = await request.json()
  const { crmType, crmConfig, slack } = body

  // Update CRM config if provided
  if (crmType && crmConfig) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        crmType,
        crmConfig: crmConfig as any,
      },
    })
  }

  // Upsert Slack config if provided
  if (slack?.botToken && slack?.channelId) {
    await prisma.tenantSlackConfig.upsert({
      where: { tenantId: tenant.id },
      update: {
        botToken: slack.botToken,
        channelId: slack.channelId,
        teamId: slack.teamId ?? '',
      },
      create: {
        tenantId: tenant.id,
        botToken: slack.botToken,
        channelId: slack.channelId,
        teamId: slack.teamId ?? '',
      },
    })
  }

  return NextResponse.json({ success: true })
}
