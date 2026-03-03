import { ZodError } from 'zod'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import { getTenantApiKeySettings, saveTenantApiKeySettings } from '@/lib/settings/api-keys'

export async function GET() {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  const apiKeys = await getTenantApiKeySettings(prisma, authResult.tenant.id)
  return NextResponse.json(apiKeys)
}

export async function PUT(request: Request) {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  try {
    const body = await request.json()
    const apiKeys = await saveTenantApiKeySettings(prisma, authResult.tenant.id, body)
    return NextResponse.json({ success: true, ...apiKeys })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    }

    console.error('settings/api-keys PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
