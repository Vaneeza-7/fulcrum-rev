import crypto from 'node:crypto'
import { prisma } from '@/lib/db'
import { env } from '@/lib/config'
import { getBillingPlan, getPlanSlugFromPriceId, isPlanSlug, type PlanSlug } from './plans'
import { grantIncludedCreditsForPeriod } from './ledger'

const STRIPE_BASE_URL = 'https://api.stripe.com/v1'
const STRIPE_USAGE_SCALE = 100

function requireStripeSecretKey() {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }

  return env.STRIPE_SECRET_KEY
}

async function stripeRequest<T>(
  path: string,
  params?: URLSearchParams,
  options?: {
    method?: 'GET' | 'POST'
    idempotencyKey?: string
  },
): Promise<T> {
  const secretKey = requireStripeSecretKey()
  const response = await fetch(`${STRIPE_BASE_URL}${path}`, {
    method: options?.method ?? 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(options?.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    },
    body: params,
  })

  if (!response.ok) {
    throw new Error(`Stripe request failed: ${response.status} ${await response.text()}`)
  }

  return response.json() as Promise<T>
}

function getAppUrl() {
  return env.APP_URL ?? 'http://localhost:3000'
}

export function hashStripePayload(payload: string) {
  return crypto.createHash('sha256').update(payload).digest('hex')
}

export function verifyStripeWebhookSignature(payload: string, signatureHeader: string | null) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured')
  }

  if (!signatureHeader) {
    throw new Error('Missing Stripe signature')
  }

  const components = signatureHeader.split(',').reduce<Record<string, string>>((acc, item) => {
    const [key, value] = item.split('=')
    if (key && value) acc[key] = value
    return acc
  }, {})

  if (!components.t || !components.v1) {
    throw new Error('Invalid Stripe signature header')
  }

  const expected = crypto
    .createHmac('sha256', env.STRIPE_WEBHOOK_SECRET)
    .update(`${components.t}.${payload}`)
    .digest('hex')

  const provided = Buffer.from(components.v1, 'utf8')
  const computed = Buffer.from(expected, 'utf8')

  if (provided.length !== computed.length || !crypto.timingSafeEqual(provided, computed)) {
    throw new Error('Invalid Stripe signature')
  }
}

export async function ensureStripeCustomerForTenant(input: {
  tenantId: string
  tenantName: string
  billingEmail?: string | null
}) {
  const existing = await prisma.tenantBillingAccount.findUnique({
    where: { tenantId: input.tenantId },
  })

  if (existing?.stripeCustomerId) {
    return existing.stripeCustomerId
  }

  const params = new URLSearchParams()
  params.set('name', input.tenantName)
  if (input.billingEmail) params.set('email', input.billingEmail)
  params.set('metadata[tenantId]', input.tenantId)

  const customer = await stripeRequest<{ id: string }>('/customers', params, {
    idempotencyKey: `customer:${input.tenantId}`,
  })

  await prisma.tenantBillingAccount.upsert({
    where: { tenantId: input.tenantId },
    create: {
      tenantId: input.tenantId,
      stripeCustomerId: customer.id,
      billingEmail: input.billingEmail ?? null,
    },
    update: {
      stripeCustomerId: customer.id,
      billingEmail: input.billingEmail ?? null,
    },
  })

  return customer.id
}

export async function createStripeCheckoutSession(input: {
  tenantId: string
  tenantName: string
  billingEmail?: string | null
  planSlug: PlanSlug
}) {
  const customerId = await ensureStripeCustomerForTenant(input)
  const plan = getBillingPlan(input.planSlug)

  if (!plan.basePriceId || !plan.overagePriceId) {
    throw new Error(`Stripe prices are not configured for plan ${input.planSlug}`)
  }

  const params = new URLSearchParams()
  params.set('mode', 'subscription')
  params.set('customer', customerId)
  params.set('success_url', `${getAppUrl()}/settings?billing=success`)
  params.set('cancel_url', `${getAppUrl()}/settings?billing=cancelled`)
  params.set('line_items[0][price]', plan.basePriceId)
  params.set('line_items[0][quantity]', '1')
  params.set('line_items[1][price]', plan.overagePriceId)
  params.set('subscription_data[metadata][tenantId]', input.tenantId)
  params.set('subscription_data[metadata][planSlug]', input.planSlug)
  params.set('metadata[tenantId]', input.tenantId)
  params.set('metadata[planSlug]', input.planSlug)
  params.set('allow_promotion_codes', 'true')

  const session = await stripeRequest<{ url: string | null }>('/checkout/sessions', params, {
    idempotencyKey: `checkout:${input.tenantId}:${input.planSlug}`,
  })

  if (!session.url) {
    throw new Error('Stripe checkout session did not return a URL')
  }

  return session.url
}

export async function createStripePortalSession(customerId: string) {
  const params = new URLSearchParams()
  params.set('customer', customerId)
  params.set('return_url', `${getAppUrl()}/settings`)

  const session = await stripeRequest<{ url: string | null }>('/billing_portal/sessions', params)
  if (!session.url) {
    throw new Error('Stripe portal session did not return a URL')
  }

  return session.url
}

export async function reportStripeUsage(input: {
  subscriptionItemId: string
  quantity: number
  timestamp: number
  idempotencyKey: string
}) {
  const scaledQuantity = Math.max(0, Math.round(input.quantity * STRIPE_USAGE_SCALE))
  if (scaledQuantity === 0) return

  const params = new URLSearchParams()
  params.set('quantity', String(scaledQuantity))
  params.set('timestamp', String(input.timestamp))
  params.set('action', 'increment')

  await stripeRequest(`/subscription_items/${input.subscriptionItemId}/usage_records`, params, {
    idempotencyKey: input.idempotencyKey,
  })
}

function unixToDate(value: number | null | undefined) {
  return value ? new Date(value * 1000) : null
}

function extractOverageSubscriptionItemId(planSlug: PlanSlug, subscription: any) {
  const overagePriceId = getBillingPlan(planSlug).overagePriceId
  const item = subscription?.items?.data?.find((candidate: any) => candidate?.price?.id === overagePriceId)
  return item?.id ?? null
}

export async function syncBillingAccountFromSubscription(subscription: any) {
  const metadataPlanSlug =
    (typeof subscription?.metadata?.planSlug === 'string' && subscription.metadata.planSlug) ||
    null

  const pricePlanSlug =
    subscription?.items?.data
      ?.map((item: any) => getPlanSlugFromPriceId(item?.price?.id))
      .find(Boolean) ?? null

  const planSlug = metadataPlanSlug && isPlanSlug(metadataPlanSlug)
    ? metadataPlanSlug
    : pricePlanSlug

  const tenantId =
    (typeof subscription?.metadata?.tenantId === 'string' && subscription.metadata.tenantId) ||
    null

  if (!tenantId) {
    throw new Error('Stripe subscription is missing tenantId metadata')
  }

  const existingAccount = await prisma.tenantBillingAccount.findUnique({
    where: { tenantId },
  })
  const nextPeriodStart = unixToDate(subscription.current_period_start)
  const shouldResetOverage =
    !!nextPeriodStart &&
    nextPeriodStart.toISOString() !== existingAccount?.currentPeriodStart?.toISOString()

  const account = await prisma.tenantBillingAccount.upsert({
    where: { tenantId },
    create: {
      tenantId,
      stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : null,
      stripeSubscriptionId: typeof subscription.id === 'string' ? subscription.id : null,
      stripeOverageSubscriptionItemId:
        planSlug && isPlanSlug(planSlug) ? extractOverageSubscriptionItemId(planSlug, subscription) : null,
      subscriptionStatus: subscription.status ?? 'inactive',
      planSlug,
      currentPeriodStart: nextPeriodStart,
      currentPeriodEnd: unixToDate(subscription.current_period_end),
      reportedOverageCredits: 0,
    },
    update: {
      stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : null,
      stripeSubscriptionId: typeof subscription.id === 'string' ? subscription.id : null,
      stripeOverageSubscriptionItemId:
        planSlug && isPlanSlug(planSlug) ? extractOverageSubscriptionItemId(planSlug, subscription) : null,
      subscriptionStatus: subscription.status ?? 'inactive',
      planSlug,
      currentPeriodStart: nextPeriodStart,
      currentPeriodEnd: unixToDate(subscription.current_period_end),
      ...(shouldResetOverage ? { reportedOverageCredits: 0 } : {}),
    },
  })

  if (
    account.stripeSubscriptionId &&
    planSlug &&
    isPlanSlug(planSlug) &&
    ['active', 'trialing'].includes(subscription.status ?? '')
  ) {
    const periodStart = unixToDate(subscription.current_period_start)
    const periodEnd = unixToDate(subscription.current_period_end)

    if (periodStart && periodEnd) {
      await grantIncludedCreditsForPeriod({
        tenantId,
        planSlug,
        subscriptionId: account.stripeSubscriptionId,
        periodStart,
        periodEnd,
      })
    }
  }

  return account
}
