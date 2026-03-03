import { ZodError } from 'zod'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import { getTenantScoringConfig, upsertTenantScoringConfig } from '@/lib/settings/scoring'

export async function GET() {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  const scoringConfig = await getTenantScoringConfig(prisma, authResult.tenant.id)
  return NextResponse.json({ scoringConfig })
}

export async function PUT(request: Request) {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  try {
    const body = await request.json()
    const scoringConfig = await upsertTenantScoringConfig(prisma, authResult.tenant.id, body.scoringConfig)
    return NextResponse.json({ success: true, scoringConfig })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    }

    console.error('settings/scoring PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
