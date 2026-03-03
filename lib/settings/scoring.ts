import { z } from 'zod'
import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'

const companySizeSchema = z.object({
  min: z.number(),
  max: z.number(),
  points: z.number(),
})

const industryFitSchema = z.object({
  match: z.string().trim().min(1),
  points: z.number(),
})

const roleAuthoritySchema = z.object({
  pattern: z.string().trim().min(1),
  points: z.number(),
})

const revenueSignalSchema = z.object({
  signal: z.string().trim().min(1),
  points: z.number(),
})

const scoringConfigSchema = z.object({
  company_size: z.array(companySizeSchema),
  industry_fit: z.array(industryFitSchema),
  role_authority: z.array(roleAuthoritySchema),
  revenue_signals: z.array(revenueSignalSchema),
})

type SettingsDbClient = PrismaClient | Prisma.TransactionClient

const SCORING_CONFIG_TYPES = [
  'company_size',
  'industry_fit',
  'role_authority',
  'revenue_signals',
] as const

export type TenantScoringConfigInput = z.infer<typeof scoringConfigSchema>

export async function getTenantScoringConfig(db: SettingsDbClient, tenantId: string): Promise<TenantScoringConfigInput> {
  const scoringConfig: TenantScoringConfigInput = {
    company_size: [],
    industry_fit: [],
    role_authority: [],
    revenue_signals: [],
  }

  const configs = await db.tenantScoringConfig.findMany({
    where: { tenantId },
  })

  for (const config of configs) {
    const configType = config.configType as keyof TenantScoringConfigInput
    if (configType in scoringConfig) {
      ;(scoringConfig as Record<string, unknown>)[configType] = config.configData
    }
  }

  return scoringConfig
}

export async function upsertTenantScoringConfig(
  db: SettingsDbClient,
  tenantId: string,
  scoringConfig: unknown,
) {
  const parsed = scoringConfigSchema.parse(scoringConfig)

  const persist = async (tx: SettingsDbClient) => {
    for (const configType of SCORING_CONFIG_TYPES) {
      await tx.tenantScoringConfig.upsert({
        where: {
          tenantId_configType: {
            tenantId,
            configType,
          },
        },
        create: {
          tenantId,
          configType,
          configData: parsed[configType] as Prisma.JsonArray,
        },
        update: {
          configData: parsed[configType] as Prisma.JsonArray,
        },
      })
    }
  }

  if (db === prisma) {
    await prisma.$transaction(async (tx) => persist(tx))
  } else {
    await persist(db)
  }

  return parsed
}
