import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { prisma } from '@/lib/db';
import { initializeColdStart } from '@/lib/cold-start';
import { clerkWebhookSchema } from '@/lib/validation/schemas';
import { routeLogger } from '@/lib/logger';

const log = routeLogger('/api/webhooks/clerk');

/**
 * Clerk webhook handler for organization lifecycle events.
 * Creates/updates/deletes Tenant records based on Clerk org events.
 * Uses Svix signature verification (Clerk's webhook delivery mechanism).
 */
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    log.error('CLERK_WEBHOOK_SECRET not set — rejecting webhook');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  // Read raw body for signature verification
  const rawBody = await request.text();

  // Svix headers sent by Clerk
  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Svix headers' }, { status: 400 });
  }

  // Verify the webhook signature
  let body: unknown;
  try {
    const wh = new Webhook(webhookSecret);
    body = wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    log.error({ error: err }, 'Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  try {
    const parsed = clerkWebhookSchema.safeParse(body);

    if (!parsed.success) {
      log.error({ issues: parsed.error.issues }, 'Invalid webhook payload');
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { type, data } = parsed.data;

    switch (type) {
      case 'organization.created': {
        const tenant = await prisma.tenant.create({
          data: {
            clerkOrgId: data.id,
            name: data.name ?? data.id,
            slug: data.slug ?? data.id,
            productType: 'custom',
            crmType: null,
            crmConfig: {},
          },
        });

        // Initialize cold-start state (non-fatal — tenant creation must not fail)
        try {
          await initializeColdStart(tenant.id);
        } catch (err) {
          log.error({ error: err, tenantId: tenant.id }, 'Failed to initialize cold-start (non-fatal)');
        }

        log.info({ tenantId: tenant.id, clerkOrgId: data.id }, 'Tenant created from Clerk webhook');
        break;
      }

      case 'organization.updated': {
        await prisma.tenant.updateMany({
          where: { clerkOrgId: data.id },
          data: {
            ...(data.name ? { name: data.name } : {}),
            ...(data.slug ? { slug: data.slug } : {}),
          },
        });
        log.info({ clerkOrgId: data.id }, 'Tenant updated from Clerk webhook');
        break;
      }

      case 'organization.deleted': {
        await prisma.tenant.updateMany({
          where: { clerkOrgId: data.id },
          data: { isActive: false },
        });
        log.info({ clerkOrgId: data.id }, 'Tenant deactivated from Clerk webhook');
        break;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error({ error }, 'Clerk webhook error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
