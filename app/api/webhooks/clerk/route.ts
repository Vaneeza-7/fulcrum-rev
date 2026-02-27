import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { initializeColdStart } from '@/lib/cold-start';
import { clerkWebhookSchema } from '@/lib/validation/schemas';
import { routeLogger } from '@/lib/logger';

const log = routeLogger('/api/webhooks/clerk');

/**
 * Clerk webhook handler for organization lifecycle events.
 * Creates/updates/deletes Tenant records based on Clerk org events.
 */
export async function POST(request: NextRequest) {
  // Verify webhook secret
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (webhookSecret) {
    const headerSecret = request.headers.get('x-clerk-webhook-secret');
    if (headerSecret !== webhookSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const body = await request.json();
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
            crmType: 'hubspot',
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
