import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

type TenantSlugClient = Prisma.TransactionClient | typeof prisma

interface ResolveUniqueTenantSlugOptions {
  excludeTenantId?: string
  fallbackSeed?: string
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeTenantSlug(input: string | null | undefined, fallbackSeed = 'org'): string {
  const normalized = slugify(input ?? '')
  if (normalized.length > 0) {
    return normalized
  }

  const fallback = slugify(fallbackSeed)
  return fallback.length > 0 ? fallback : 'org'
}

export async function resolveUniqueTenantSlug(
  db: TenantSlugClient,
  input: string | null | undefined,
  options: ResolveUniqueTenantSlugOptions = {},
): Promise<string> {
  const baseSlug = normalizeTenantSlug(input, options.fallbackSeed)

  for (let suffix = 1; suffix < 10_000; suffix += 1) {
    const candidate = suffix === 1 ? baseSlug : `${baseSlug}-${suffix}`
    const existing = await db.tenant.findFirst({
      where: {
        slug: candidate,
        ...(options.excludeTenantId ? { id: { not: options.excludeTenantId } } : {}),
      },
      select: { id: true },
    })

    if (!existing) {
      return candidate
    }
  }

  throw new Error(`Unable to resolve a unique tenant slug for base "${baseSlug}"`)
}
