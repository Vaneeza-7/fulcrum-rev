import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/db'
import { saveTenantCrmSettings } from '@/lib/settings/crm'
import { saveTenantSlackSettings } from '@/lib/settings/slack'

export async function POST(request: Request) {
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

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const crmEnabled = !!body.crmEnabled
    const slackEnabled = !!body.slackEnabled
    const emailEnabled = !!body.emailEnabled

    if (!crmEnabled && !slackEnabled && !emailEnabled) {
      return NextResponse.json(
        { error: 'At least one delivery channel is required' },
        { status: 400 }
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.tenantDeliveryPreference.upsert({
        where: { tenantId: tenant.id },
        create: {
          tenantId: tenant.id,
          leadVolumeTarget: typeof body.leadVolumeTarget === 'number' ? body.leadVolumeTarget : 25,
          scheduleType: typeof body.scheduleType === 'string' ? body.scheduleType : 'weekdays',
          deliveryTime: typeof body.deliveryTime === 'string' ? body.deliveryTime : '06:00',
          timezone: typeof body.timezone === 'string' ? body.timezone : 'America/New_York',
          crmEnabled,
          slackEnabled,
          emailEnabled,
          emailAddress: emailEnabled && typeof body.emailAddress === 'string' ? body.emailAddress : null,
        },
        update: {
          leadVolumeTarget: typeof body.leadVolumeTarget === 'number' ? body.leadVolumeTarget : 25,
          scheduleType: typeof body.scheduleType === 'string' ? body.scheduleType : 'weekdays',
          deliveryTime: typeof body.deliveryTime === 'string' ? body.deliveryTime : '06:00',
          timezone: typeof body.timezone === 'string' ? body.timezone : 'America/New_York',
          crmEnabled,
          slackEnabled,
          emailEnabled,
          emailAddress: emailEnabled && typeof body.emailAddress === 'string' ? body.emailAddress : null,
        },
      })

      if (crmEnabled && typeof body.crmType === 'string') {
        await saveTenantCrmSettings(tx, tenant.id, {
          crmType: body.crmType,
          crmConfig: (body.crmConfig ?? {}) as Record<string, string>,
        })
      }

      const slackConfig = body.slackConfig as { teamId?: string; botToken?: string; channelId?: string } | undefined
      if (slackEnabled && slackConfig?.channelId) {
        await saveTenantSlackSettings(tx, tenant.id, {
          teamId: slackConfig.teamId ?? '',
          botToken: slackConfig.botToken,
          channelId: slackConfig.channelId,
        })
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    }

    if (error instanceof Error && error.message.includes('botToken')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error('save-delivery error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
