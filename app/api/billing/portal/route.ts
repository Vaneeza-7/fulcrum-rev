import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import { createStripePortalSession } from '@/lib/billing/stripe'

export async function POST() {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  try {
    const account = await prisma.tenantBillingAccount.findUnique({
      where: { tenantId: authResult.tenant.id },
      select: { stripeCustomerId: true },
    })

    if (!account?.stripeCustomerId) {
      return NextResponse.json({ error: 'No Stripe customer found for this tenant' }, { status: 404 })
    }

    const url = await createStripePortalSession(account.stripeCustomerId)
    return NextResponse.json({ url })
  } catch (error) {
    console.error('billing/portal error:', error)
    return NextResponse.json({ error: 'Unable to create billing portal session' }, { status: 500 })
  }
}
