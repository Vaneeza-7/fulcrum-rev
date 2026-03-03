import { ZodError } from 'zod'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import { getTenantSlackSettings, saveTenantSlackSettings } from '@/lib/settings/slack'

export async function GET() {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  const slack = await getTenantSlackSettings(prisma, authResult.tenant.id)
  return NextResponse.json({ slack })
}

export async function PUT(request: Request) {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  try {
    const body = await request.json()
    const slack = await saveTenantSlackSettings(prisma, authResult.tenant.id, body.slack)
    return NextResponse.json({ success: true, slack })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    }

    if (error instanceof Error && error.message.includes('botToken')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error('settings/slack PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
