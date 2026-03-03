import { z } from 'zod'
import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'

const intentKeywordSchema = z.object({
  keyword: z.string().trim().min(1, 'keyword is required'),
  intentScore: z.number().min(1).max(10),
  category: z.string().trim().optional(),
  isActive: z.boolean().default(true),
})

const intentKeywordsSchema = z.array(intentKeywordSchema).min(1, 'At least one keyword is required')

type SettingsDbClient = PrismaClient | Prisma.TransactionClient

export type TenantIntentKeywordInput = z.infer<typeof intentKeywordSchema>

export async function getTenantIntentKeywords(db: SettingsDbClient, tenantId: string) {
  const keywords = await db.tenantIntentKeyword.findMany({
    where: { tenantId },
    orderBy: [{ createdAt: 'asc' }],
  })

  return keywords.map((keyword) => ({
    id: keyword.id,
    keyword: keyword.keyword,
    intentScore: Number(keyword.intentScore),
    category: keyword.category ?? '',
    isActive: keyword.isActive,
  }))
}

export async function replaceTenantIntentKeywords(
  db: SettingsDbClient,
  tenantId: string,
  keywords: unknown,
) {
  const parsed = intentKeywordsSchema.parse(keywords)

  const persist = async (tx: SettingsDbClient) => {
    await tx.tenantIntentKeyword.deleteMany({
      where: { tenantId },
    })

    await tx.tenantIntentKeyword.createMany({
      data: parsed.map((keyword) => ({
        tenantId,
        keyword: keyword.keyword,
        intentScore: keyword.intentScore,
        category: keyword.category ?? null,
        isActive: keyword.isActive,
      })),
    })
  }

  if (db === prisma) {
    await prisma.$transaction(async (tx) => persist(tx))
  } else {
    await persist(db)
  }

  return parsed
}
