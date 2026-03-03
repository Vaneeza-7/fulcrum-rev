import { z } from 'zod'
import type { Prisma, PrismaClient } from '@prisma/client'
import { env } from '@/lib/config'
import {
  decryptTenantConfig,
  decryptTenantSecret,
  encryptTenantConfig,
  encryptTenantSecret,
} from '@/lib/db-crypto'

type SettingsDbClient = PrismaClient | Prisma.TransactionClient

const providerSchema = z.enum(['instantly', 'apify'])
const clearSchema = z.enum(['instantly', 'apify', 'anthropic'])

const instantlyConfigSchema = z.object({
  apiKey: z.string().trim().optional(),
  workspaceId: z.string().trim().optional(),
})

const apiKeysUpdateSchema = z.object({
  primaryLeadProvider: providerSchema,
  instantly: instantlyConfigSchema.optional(),
  apifyApiToken: z.string().trim().nullable().optional(),
  anthropicApiKey: z.string().trim().nullable().optional(),
  clear: z.array(clearSchema).default([]),
})

export type LeadDiscoveryProviderName = z.infer<typeof providerSchema>
export type TenantInstantlyConfig = z.infer<typeof instantlyConfigSchema>
export type TenantApiKeysUpdateInput = z.infer<typeof apiKeysUpdateSchema>

export function decryptInstantlyConfig(stored: unknown): TenantInstantlyConfig | null {
  return decryptTenantConfig<TenantInstantlyConfig>(stored as TenantInstantlyConfig | string | null)
}

export function resolveLeadDiscoveryProvider(provider: string | null | undefined): LeadDiscoveryProviderName {
  return provider === 'apify' ? 'apify' : 'instantly'
}

export async function getTenantApiKeySettings(db: SettingsDbClient, tenantId: string) {
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      leadDiscoveryProvider: true,
      instantlyConfig: true,
      apifyApiToken: true,
      anthropicApiKey: true,
    },
  })

  const instantlyConfig = decryptInstantlyConfig(tenant.instantlyConfig) ?? {}
  const instantlyApiKey = instantlyConfig.apiKey?.trim() || null
  const apifyApiToken = decryptTenantSecret(tenant.apifyApiToken)
  const anthropicApiKey = decryptTenantSecret(tenant.anthropicApiKey)

  return {
    primaryLeadProvider: resolveLeadDiscoveryProvider(tenant.leadDiscoveryProvider),
    providers: {
      instantly: {
        usingTenantKey: Boolean(instantlyApiKey),
        workspaceId: instantlyConfig.workspaceId?.trim() || null,
        hasPlatformFallback: Boolean(env.INSTANTLY_API_KEY),
      },
      apify: {
        usingTenantKey: Boolean(apifyApiToken),
        hasPlatformFallback: Boolean(env.APIFY_API_TOKEN),
      },
      anthropic: {
        usingTenantKey: Boolean(anthropicApiKey),
        hasPlatformFallback: Boolean(env.ANTHROPIC_API_KEY),
      },
    },
  }
}

export async function saveTenantApiKeySettings(
  db: SettingsDbClient,
  tenantId: string,
  input: unknown,
) {
  const parsed = apiKeysUpdateSchema.parse(input)

  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      instantlyConfig: true,
      apifyApiToken: true,
      anthropicApiKey: true,
    },
  })

  const clear = new Set(parsed.clear)
  const existingInstantly = decryptInstantlyConfig(tenant.instantlyConfig) ?? {}
  const mergedInstantly = clear.has('instantly')
    ? {}
    : {
        ...existingInstantly,
        ...(parsed.instantly?.workspaceId?.trim()
          ? { workspaceId: parsed.instantly.workspaceId.trim() }
          : {}),
        ...(parsed.instantly?.apiKey?.trim()
          ? { apiKey: parsed.instantly.apiKey.trim() }
          : {}),
      }

  const nextApify = clear.has('apify')
    ? null
    : parsed.apifyApiToken?.trim() || decryptTenantSecret(tenant.apifyApiToken) || null

  const nextAnthropic = clear.has('anthropic')
    ? null
    : parsed.anthropicApiKey?.trim() || decryptTenantSecret(tenant.anthropicApiKey) || null

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      leadDiscoveryProvider: parsed.primaryLeadProvider,
      instantlyConfig: encryptTenantConfig(mergedInstantly) as Prisma.InputJsonValue,
      apifyApiToken: nextApify ? encryptTenantSecret(nextApify) : null,
      anthropicApiKey: nextAnthropic ? encryptTenantSecret(nextAnthropic) : null,
    },
  })

  return getTenantApiKeySettings(db, tenantId)
}

export function resolveInstantlyCredentials(tenant: {
  instantlyConfig: unknown
}): { apiKey: string | null; workspaceId: string | null; usingTenantKey: boolean } {
  const tenantConfig = decryptInstantlyConfig(tenant.instantlyConfig) ?? {}
  const tenantApiKey = tenantConfig.apiKey?.trim() || null

  return {
    apiKey: tenantApiKey ?? env.INSTANTLY_API_KEY ?? null,
    workspaceId: tenantConfig.workspaceId?.trim() ?? env.INSTANTLY_WORKSPACE_ID ?? null,
    usingTenantKey: Boolean(tenantApiKey),
  }
}

export function resolveApifyCredentials(tenant: {
  apifyApiToken: string | null
}): { apiToken: string | null; usingTenantKey: boolean } {
  const tenantApiToken = decryptTenantSecret(tenant.apifyApiToken)

  return {
    apiToken: tenantApiToken ?? env.APIFY_API_TOKEN ?? null,
    usingTenantKey: Boolean(tenantApiToken),
  }
}

export function resolveAnthropicCredentials(tenant: {
  anthropicApiKey: string | null
}): { apiKey: string | null; usingTenantKey: boolean } {
  const tenantApiKey = decryptTenantSecret(tenant.anthropicApiKey)

  return {
    apiKey: tenantApiKey ?? env.ANTHROPIC_API_KEY ?? null,
    usingTenantKey: Boolean(tenantApiKey),
  }
}
