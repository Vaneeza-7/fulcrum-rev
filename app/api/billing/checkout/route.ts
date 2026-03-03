import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import { createStripeCheckoutSession } from '@/lib/billing/stripe'

const checkoutBodySchema = z.object({
  planSlug: z.enum(['starter', 'growth', 'scale']),
})

export async function POST(request: Request) {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  try {
    const body = checkoutBodySchema.parse(await request.json())
    const url = await createStripeCheckoutSession({
      tenantId: authResult.tenant.id,
      tenantName: authResult.tenant.name,
      planSlug: body.planSlug,
    })

    return NextResponse.json({ url })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    }

    console.error('billing/checkout error:', error)
    return NextResponse.json({ error: 'Unable to create checkout session' }, { status: 500 })
  }
}
