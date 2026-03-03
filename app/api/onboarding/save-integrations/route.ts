import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/db'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import { saveTenantCrmSettings } from '@/lib/settings/crm'
import { saveTenantSlackSettings } from '@/lib/settings/slack'

export async function POST(request: Request) {
  try {
    const authResult = await getAuthenticatedTenant()
    if ('error' in authResult) return authResult.error

    const body = await request.json()
    const { crmType, crmConfig, slack } = body

    if (crmType) {
      await saveTenantCrmSettings(prisma, authResult.tenant.id, {
        crmType,
        crmConfig,
      })
    }

    if (slack?.channelId) {
      await saveTenantSlackSettings(prisma, authResult.tenant.id, slack)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    }

    if (error instanceof Error && error.message.includes('botToken')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error('save-integrations error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
