import { z } from 'zod'
import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'

const searchQueryItemSchema = z.object({
  queryName: z.string().trim().min(1, 'queryName is required'),
  searchQuery: z.object({
    keywords: z.string().trim().min(1, 'searchQuery.keywords is required'),
    industry: z.string().trim().optional(),
    companySize: z.string().trim().optional(),
    additionalKeywords: z.string().trim().optional(),
  }),
  maxResults: z.number().int().min(1).max(100).default(10),
  isActive: z.boolean().default(true),
})

const searchQueriesSchema = z.array(searchQueryItemSchema).min(1, 'At least one query is required')

type SettingsDbClient = PrismaClient | Prisma.TransactionClient

export type TenantSearchQueryInput = z.infer<typeof searchQueryItemSchema>

export async function getTenantSearchQueries(db: SettingsDbClient, tenantId: string) {
  const queries = await db.tenantSearchQuery.findMany({
    where: { tenantId },
    orderBy: [{ createdAt: 'asc' }],
  })

  return queries.map((query) => ({
    id: query.id,
    queryName: query.queryName,
    searchQuery: query.searchQuery as TenantSearchQueryInput['searchQuery'],
    maxResults: query.maxResults,
    isActive: query.isActive,
  }))
}

export async function replaceTenantSearchQueries(
  db: SettingsDbClient,
  tenantId: string,
  queries: unknown,
) {
  const parsed = searchQueriesSchema.parse(queries)

  const persist = async (tx: SettingsDbClient) => {
    await tx.tenantSearchQuery.deleteMany({
      where: { tenantId },
    })

    await tx.tenantSearchQuery.createMany({
      data: parsed.map((query) => ({
        tenantId,
        queryName: query.queryName,
        searchQuery: query.searchQuery as Prisma.JsonObject,
        maxResults: query.maxResults,
        isActive: query.isActive,
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
