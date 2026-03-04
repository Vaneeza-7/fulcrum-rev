import { prisma } from '@/lib/db'
import { coreLaunchTenantIdAllowlist } from '@/lib/config'

export async function getCoreLaunchTenants(tenantId?: string) {
  const allowlistedTenantIds = coreLaunchTenantIdAllowlist
    ? Array.from(coreLaunchTenantIdAllowlist)
    : null

  if (tenantId && allowlistedTenantIds && !coreLaunchTenantIdAllowlist?.has(tenantId)) {
    return []
  }

  return prisma.tenant.findMany({
    where: {
      isActive: true,
      clerkOrgId: { not: null },
      ...(tenantId
        ? { id: tenantId }
        : allowlistedTenantIds
          ? { id: { in: allowlistedTenantIds } }
          : {}),
    },
    select: {
      id: true,
      name: true,
      clerkOrgId: true,
      crmPushPaused: true,
      crmPushPauseReason: true,
      crmPushPausedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })
}
