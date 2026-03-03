import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  hashStripePayload,
  syncBillingAccountFromSubscription,
  verifyStripeWebhookSignature,
} from '@/lib/billing/stripe'

export async function POST(request: Request) {
  const payload = await request.text()

  try {
    verifyStripeWebhookSignature(payload, request.headers.get('stripe-signature'))
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 })
  }

  const event = JSON.parse(payload) as {
    id: string
    type: string
    data?: { object?: any }
  }

  try {
    await prisma.stripeWebhookEvent.create({
      data: {
        stripeEventId: event.id,
        eventType: event.type,
        payloadHash: hashStripePayload(payload),
      },
    })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return NextResponse.json({ received: true, duplicate: true })
    }

    throw error
  }

  const object = event.data?.object

  switch (event.type) {
    case 'checkout.session.completed':
      if (object?.subscription && typeof object?.metadata?.tenantId === 'string') {
        await prisma.tenantBillingAccount.upsert({
          where: { tenantId: object.metadata.tenantId },
          create: {
            tenantId: object.metadata.tenantId,
            stripeCustomerId: object.customer ?? null,
            stripeSubscriptionId: object.subscription ?? null,
            planSlug: object.metadata?.planSlug ?? null,
            subscriptionStatus: 'active',
          },
          update: {
            stripeCustomerId: object.customer ?? null,
            stripeSubscriptionId: object.subscription ?? null,
            planSlug: object.metadata?.planSlug ?? null,
            subscriptionStatus: 'active',
          },
        })
      }
      break

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await syncBillingAccountFromSubscription(object)
      break

    case 'invoice.paid':
      if (object?.subscription) {
        const subscription = await prisma.tenantBillingAccount.findFirst({
          where: { stripeSubscriptionId: object.subscription },
        })

        if (subscription) {
          await prisma.tenantBillingAccount.update({
            where: { id: subscription.id },
            data: { subscriptionStatus: 'active' },
          })
        }
      }
      break

    case 'invoice.payment_failed':
      if (object?.subscription) {
        const subscription = await prisma.tenantBillingAccount.findFirst({
          where: { stripeSubscriptionId: object.subscription },
        })

        if (subscription) {
          await prisma.tenantBillingAccount.update({
            where: { id: subscription.id },
            data: { subscriptionStatus: 'past_due' },
          })
        }
      }
      break

    default:
      break
  }

  return NextResponse.json({ received: true })
}
