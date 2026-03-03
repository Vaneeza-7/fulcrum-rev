import { z } from 'zod'
import type { Prisma, PrismaClient } from '@prisma/client'
import { decryptTenantSecret, encryptTenantSecret } from '@/lib/db-crypto'

type SettingsDbClient = PrismaClient | Prisma.TransactionClient

const tenantSlackSchema = z.object({
  teamId: z.string().trim().default(''),
  channelId: z.string().trim().min(1, 'channelId is required'),
  botToken: z.string().trim().optional(),
})

export type TenantSlackUpdateInput = z.infer<typeof tenantSlackSchema>

export function decryptSlackBotToken(stored: string | null | undefined) {
  return decryptTenantSecret(stored)
}

export async function getTenantSlackSettings(db: SettingsDbClient, tenantId: string) {
  const config = await db.tenantSlackConfig.findUnique({
    where: { tenantId },
  })

  const botToken = decryptSlackBotToken(config?.botToken)
  const hasBotToken = Boolean(botToken)

  return {
    connected: Boolean(config?.channelId && hasBotToken),
    teamId: config?.teamId ?? null,
    channelId: config?.channelId ?? null,
    installedAt: config?.installedAt ?? null,
    hasBotToken,
  }
}

export async function saveTenantSlackSettings(
  db: SettingsDbClient,
  tenantId: string,
  input: unknown,
) {
  const parsed = tenantSlackSchema.parse(input)
  const existing = await db.tenantSlackConfig.findUnique({
    where: { tenantId },
  })

  const existingBotToken = decryptSlackBotToken(existing?.botToken)
  const mergedBotToken = parsed.botToken?.trim() || existingBotToken

  if (!mergedBotToken) {
    throw new Error('botToken is required when creating a Slack configuration')
  }

  await db.tenantSlackConfig.upsert({
    where: { tenantId },
    create: {
      tenantId,
      teamId: parsed.teamId,
      channelId: parsed.channelId,
      botToken: encryptTenantSecret(mergedBotToken),
    },
    update: {
      teamId: parsed.teamId,
      channelId: parsed.channelId,
      botToken: encryptTenantSecret(mergedBotToken),
    },
  })

  return getTenantSlackSettings(db, tenantId)
}
