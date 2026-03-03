import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/db'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import { replaceTenantSearchQueries } from '@/lib/settings/search-queries'

export async function POST(request: Request) {
  try {
    const authResult = await getAuthenticatedTenant()
    if ('error' in authResult) return authResult.error

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const queries = await replaceTenantSearchQueries(prisma, authResult.tenant.id, body.queries)

    return NextResponse.json({ success: true, count: queries.length })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    }

    console.error('save-queries error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
