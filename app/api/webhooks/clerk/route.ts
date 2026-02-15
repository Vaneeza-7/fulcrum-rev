import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * POST /api/webhooks/clerk
 * Handle Clerk organization webhooks.
 * Creates a tenant record when a new Clerk organization is created.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  // Verify Clerk webhook signature (simplified - use svix in production)
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (webhookSecret) {
    const svixId = request.headers.get('svix-id');
    if (!svixId) {
      return NextResponse.json({ error: 'Missing webhook signature' }, { status: 401 });
    }
  }

  switch (body.type) {
    case 'organization.created': {
      const org = body.data;
      await prisma.tenant.create({
        data: {
          clerkOrgId: org.id,
          name: org.name,
          slug: org.slug ?? org.name.toLowerCase().replace(/\s+/g, '-'),
          productType: 'custom', // Updated during onboarding
          crmType: 'zoho', // Default, updated during onboarding
        },
      });
      console.log(`Tenant created for Clerk org: ${org.name}`);
      break;
    }

    case 'organization.updated': {
      const org = body.data;
      await prisma.tenant.updateMany({
        where: { clerkOrgId: org.id },
        data: { name: org.name },
      });
      break;
    }

    case 'organization.deleted': {
      const org = body.data;
      await prisma.tenant.updateMany({
        where: { clerkOrgId: org.id },
        data: { isActive: false },
      });
      break;
    }
  }

  return NextResponse.json({ received: true });
}
