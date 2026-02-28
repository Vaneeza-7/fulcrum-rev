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

  const channels = body.channels as {
    crm?: { type: string; config: Record<string, string> }
    slack?: { teamId: string; botToken: string; channelId: string }
    email?: { address: string }
  } | undefined

  if (!channels || (!channels.crm && !channels.slack && !channels.email)) {
    return NextResponse.json(
      { error: 'At least one delivery channel is required' },
      { status: 400 }
    )
  }

  const crmEnabled = !!channels.crm
  const slackEnabled = !!channels.slack
  const emailEnabled = !!channels.email

  await prisma.$transaction(async (tx) => {
    // Upsert delivery preferences
    await tx.tenantDeliveryPreference.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        leadVolumeTarget: body.leadVolumeTarget ?? 25,
        scheduleType: body.scheduleType ?? 'weekdays',
        deliveryTime: body.deliveryTime ?? '06:00',
        timezone: body.timezone ?? 'America/New_York',
        crmEnabled,
        slackEnabled,
        emailEnabled,
        emailAddress: channels.email?.address ?? null,
      },
      update: {
        leadVolumeTarget: body.leadVolumeTarget ?? 25,
        scheduleType: body.scheduleType ?? 'weekdays',
        deliveryTime: body.deliveryTime ?? '06:00',
        timezone: body.timezone ?? 'America/New_York',
        crmEnabled,
        slackEnabled,
        emailEnabled,
        emailAddress: channels.email?.address ?? null,
      },
    })

    // If CRM channel provided, update tenant CRM config
    if (channels.crm) {
      await tx.tenant.update({
        where: { id: tenant.id },
        data: {
          crmType: channels.crm.type,
          crmConfig: channels.crm.config as any,
        },
      })
    }

    // If Slack channel provided, upsert TenantSlackConfig
    if (channels.slack) {
      await tx.tenantSlackConfig.upsert({
        where: { tenantId: tenant.id },
        create: {
          tenantId: tenant.id,
          teamId: channels.slack.teamId,
          botToken: channels.slack.botToken,
          channelId: channels.slack.channelId,
        },
        update: {
          teamId: channels.slack.teamId,
          botToken: channels.slack.botToken,
          channelId: channels.slack.channelId,
        },
      })
    }
  })

  return NextResponse.json({ success: true })
}
