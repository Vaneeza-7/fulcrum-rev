import { NextRequest, NextResponse } from 'next/server'
import { tenantIdParam } from '@/lib/validation/schemas'

export function getTenantIdFromRequest(request: NextRequest): {
  tenantId?: string
  error?: NextResponse
} {
  const tenantIdRaw = request.nextUrl.searchParams.get('tenantId') ?? undefined
  const parsed = tenantIdParam.safeParse(tenantIdRaw)

  if (!parsed.success) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Invalid tenantId query parameter' },
        { status: 400 }
      ),
    }
  }

  return { tenantId: parsed.data }
}
