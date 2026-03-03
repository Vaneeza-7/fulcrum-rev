import { ZodError } from 'zod'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import { getTenantCrmSettings, saveTenantCrmSettings } from '@/lib/settings/crm'

export async function GET() {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  const crm = await getTenantCrmSettings(prisma, authResult.tenant.id)
  return NextResponse.json({ crm })
}

export async function PUT(request: Request) {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  try {
    const body = await request.json()
    const crm = await saveTenantCrmSettings(prisma, authResult.tenant.id, {
      crmType: body.crmType,
      crmConfig: body.crmConfig,
    })

    return NextResponse.json({ success: true, crm })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    }

    console.error('settings/crm PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
