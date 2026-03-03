import { ZodError } from 'zod'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import { getTenantSearchQueries, replaceTenantSearchQueries } from '@/lib/settings/search-queries'

export async function GET() {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  const queries = await getTenantSearchQueries(prisma, authResult.tenant.id)
  return NextResponse.json({ queries })
}

export async function PUT(request: Request) {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  try {
    const body = await request.json()
    const queries = await replaceTenantSearchQueries(prisma, authResult.tenant.id, body.queries)
    return NextResponse.json({ success: true, count: queries.length })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    }

    console.error('settings/search-queries PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
