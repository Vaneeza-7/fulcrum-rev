import { ZodError } from 'zod'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import { getTenantIntentKeywords, replaceTenantIntentKeywords } from '@/lib/settings/intent-keywords'

export async function GET() {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  const keywords = await getTenantIntentKeywords(prisma, authResult.tenant.id)
  return NextResponse.json({ keywords })
}

export async function PUT(request: Request) {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  try {
    const body = await request.json()
    const keywords = await replaceTenantIntentKeywords(prisma, authResult.tenant.id, body.keywords)
    return NextResponse.json({ success: true, count: keywords.length })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    }

    console.error('settings/intent-keywords PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
