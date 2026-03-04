import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/cron/verify-auth'
import { syncBillingPeriodsForAllTenants } from '@/lib/billing/usage'
import { getTenantIdFromRequest } from '@/lib/cron/get-tenant-id'
import { getCoreLaunchTenants } from '@/lib/tenants/core-launch'

export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const { tenantId, error } = getTenantIdFromRequest(request)
  if (error) return error

  try {
    const tenants = await getCoreLaunchTenants(tenantId)
    const tenantIds = tenants.map((tenant) => tenant.id)
    const results = await syncBillingPeriodsForAllTenants(tenantIds)
    return NextResponse.json({
      success: true,
      syncedTenants: results.length,
      results,
    })
  } catch (billingError) {
    console.error('billing-sync error:', billingError)
    return NextResponse.json({ error: 'Billing sync failed' }, { status: 500 })
  }
}
