import { NextResponse } from 'next/server'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import { getTenantBillingSummary } from '@/lib/billing/summary'

export async function GET() {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  const summary = await getTenantBillingSummary(authResult.tenant.id)
  return NextResponse.json({ billing: summary.billing })
}
