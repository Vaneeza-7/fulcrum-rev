import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  seedTenant,
  HUNHU_CONFIG,
  PULSE_CONFIG,
  FULCRUM_COLLECTIVE_CONFIG,
} from '@/lib/onboarding/seed-tenant'
import type { TenantSeedConfig } from '@/lib/onboarding/seed-tenant'

const TEMPLATES: Record<string, TenantSeedConfig> = {
  hunhu: HUNHU_CONFIG,
  pulse: PULSE_CONFIG,
  fulcrum_collective: FULCRUM_COLLECTIVE_CONFIG,
}

export async function POST(request: Request) {
  const { orgId, orgSlug } = await auth()
  if (!orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Idempotent — return existing tenant if already created
  const existing = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
  })
  if (existing) {
    return NextResponse.json({ tenantId: existing.id, alreadyExists: true })
  }

  const body = await request.json()
  const template = body.template as string
  const name = body.name as string | undefined

  // Use a unique slug based on the org to avoid unique constraint conflicts
  const uniqueSlug = orgSlug ?? `org-${orgId.slice(0, 8)}`

  if (template === 'custom') {
    // Create bare tenant with no pre-filled config
    const tenant = await prisma.tenant.create({
      data: {
        clerkOrgId: orgId,
        name: name ?? orgSlug ?? 'My Organization',
        slug: uniqueSlug,
        productType: 'custom',
        crmType: 'zoho',
        crmConfig: {},
      },
    })
    return NextResponse.json({ tenantId: tenant.id })
  }

  const config = TEMPLATES[template]
  if (!config) {
    return NextResponse.json({ error: 'Invalid template' }, { status: 400 })
  }

  // Seed from template with the Clerk org ID injected
  const tenantId = await seedTenant({
    ...config,
    clerkOrgId: orgId,
    name: name ?? config.name,
    slug: uniqueSlug,
  })

  return NextResponse.json({ tenantId })
}
