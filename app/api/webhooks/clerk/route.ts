import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { Webhook } from 'svix';
import { prisma } from '@/lib/db';
import { initializeColdStart } from '@/lib/cold-start';
import { clerkWebhookSchema } from '@/lib/validation/schemas';
import { routeLogger } from '@/lib/logger';
import { resolveUniqueTenantSlug } from '@/lib/tenants/slug';

const log = routeLogger('/api/webhooks/clerk');

async function createOrUpdateTenantFromClerkOrg(data: { id: string; name?: string | null; slug?: string | null }) {
  const existing = await prisma.tenant.findUnique({
    where: { clerkOrgId: data.id },
  });

  if (existing) {
    const nextSlug = data.slug
      ? await resolveUniqueTenantSlug(prisma, data.slug, {
          excludeTenantId: existing.id,
          fallbackSeed: data.id,
        })
      : existing.slug;

    return prisma.tenant.update({
      where: { id: existing.id },
      data: {
        name: data.name ?? existing.name,
        slug: nextSlug,
      },
    });
  }

  const baseSlug = data.slug ?? data.name ?? data.id;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const slug = await resolveUniqueTenantSlug(prisma, baseSlug, {
        fallbackSeed: data.id,
      });

      return await prisma.tenant.create({
        data: {
          clerkOrgId: data.id,
          name: data.name ?? data.id,
          slug,
          productType: 'custom',
          crmType: null,
          crmConfig: {},
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }

      const tenantCreatedElsewhere = await prisma.tenant.findUnique({
        where: { clerkOrgId: data.id },
      });
      if (tenantCreatedElsewhere) {
        return tenantCreatedElsewhere;
      }
    }
  }

  throw new Error(`Unable to create tenant for Clerk organization ${data.id}`);
}

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
        const tenant = await createOrUpdateTenantFromClerkOrg(data);

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
        await createOrUpdateTenantFromClerkOrg(data);
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
