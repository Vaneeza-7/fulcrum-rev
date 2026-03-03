import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/cron/verify-auth'
import { syncBillingPeriodsForAllTenants } from '@/lib/billing/usage'

export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  try {
    const results = await syncBillingPeriodsForAllTenants()
    return NextResponse.json({
      success: true,
      syncedTenants: results.length,
      results,
    })
  } catch (error) {
    console.error('billing-sync error:', error)
    return NextResponse.json({ error: 'Billing sync failed' }, { status: 500 })
  }
}
