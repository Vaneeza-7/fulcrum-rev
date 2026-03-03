import { z } from 'zod'
import type { Prisma, PrismaClient } from '@prisma/client'
import type { CRMAuthConfig } from '@/lib/crm/types'
import { decryptTenantConfig, encryptTenantConfig } from '@/lib/db-crypto'

type SettingsDbClient = PrismaClient | Prisma.TransactionClient

const crmConfigValueSchema = z.record(z.string(), z.string())

const tenantCrmUpdateSchema = z.object({
  crmType: z.enum(['zoho', 'hubspot', 'salesforce']),
  crmConfig: crmConfigValueSchema.optional(),
})

export type TenantCrmUpdateInput = z.infer<typeof tenantCrmUpdateSchema>

function maskSecretValue(value: string) {
  if (!value) return value
  if (value.length <= 4) return '*'.repeat(value.length)
  return `${'*'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`
}

function maskConfig(config: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, maskSecretValue(value)]),
  )
}

function mergeConfig(
  existing: Record<string, string>,
  incoming: Record<string, string> | undefined,
) {
  if (!incoming) return existing

  const merged = { ...existing }
  for (const [key, value] of Object.entries(incoming)) {
    const trimmed = value.trim()
    if (trimmed.length > 0) {
      merged[key] = trimmed
    }
  }
  return merged
}

export function decryptCrmConfig(
  stored: unknown,
): CRMAuthConfig | null {
  return decryptTenantConfig<CRMAuthConfig>(stored as CRMAuthConfig | string | null)
}

export async function getTenantCrmSettings(db: SettingsDbClient, tenantId: string) {
  const [tenant, lastPush] = await Promise.all([
    db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        crmType: true,
        crmConfig: true,
      },
    }),
    db.lead.findFirst({
      where: {
        tenantId,
        pushedToCrmAt: { not: null },
      },
      orderBy: { pushedToCrmAt: 'desc' },
      select: { pushedToCrmAt: true },
    }),
  ])

  const decrypted = decryptCrmConfig(tenant.crmConfig) ?? {}
  const hasTenantConfig = Object.keys(decrypted).length > 0

  return {
    crmType: tenant.crmType,
    connected: Boolean(tenant.crmType && hasTenantConfig),
    maskedConfig: maskConfig(decrypted as Record<string, string>),
    hasTenantConfig,
    lastPushAt: lastPush?.pushedToCrmAt ?? null,
    customViewUrl: typeof decrypted.custom_view_url === 'string' ? decrypted.custom_view_url : null,
  }
}

export async function saveTenantCrmSettings(
  db: SettingsDbClient,
  tenantId: string,
  input: unknown,
) {
  const parsed = tenantCrmUpdateSchema.parse(input)
  const existingTenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { crmConfig: true },
  })

  const existingConfig = decryptCrmConfig(existingTenant.crmConfig) ?? {}
  const mergedConfig = mergeConfig(existingConfig as Record<string, string>, parsed.crmConfig)

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      crmType: parsed.crmType,
      crmConfig: encryptTenantConfig(mergedConfig) as Prisma.InputJsonValue,
    },
  })

  return getTenantCrmSettings(db, tenantId)
}
