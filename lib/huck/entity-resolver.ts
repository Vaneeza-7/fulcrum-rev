import { prisma } from '@/lib/db';
import type { Lead, Tenant, DealDiagnostic } from '@prisma/client';

interface ResolvedEntity<T> {
  match: T | null;
  confidence: number; // 0-1
}

/**
 * Fuzzy match a lead by name or company within a tenant.
 * Uses ILIKE for case-insensitive partial matching.
 */
export async function resolveLeadByName(
  tenantId: string,
  name: string
): Promise<ResolvedEntity<Lead>> {
  if (!name || name.trim().length < 2) {
    return { match: null, confidence: 0 };
  }

  const searchTerm = name.trim();

  // Try exact match on full_name first
  const exact = await prisma.lead.findFirst({
    where: {
      tenantId,
      fullName: { equals: searchTerm, mode: 'insensitive' },
    },
    orderBy: { fulcrumScore: 'desc' },
  });

  if (exact) {
    return { match: exact, confidence: 1.0 };
  }

  // Try ILIKE partial match on name or company
  const partial = await prisma.lead.findMany({
    where: {
      tenantId,
      OR: [
        { fullName: { contains: searchTerm, mode: 'insensitive' } },
        { company: { contains: searchTerm, mode: 'insensitive' } },
      ],
    },
    orderBy: { fulcrumScore: 'desc' },
    take: 5,
  });

  if (partial.length === 0) {
    return { match: null, confidence: 0 };
  }

  if (partial.length === 1) {
    return { match: partial[0], confidence: 0.8 };
  }

  // Multiple matches — return highest scored, lower confidence
  return { match: partial[0], confidence: 0.6 };
}

/**
 * Resolve a tenant by name or slug.
 */
export async function resolveTenantByName(
  name: string
): Promise<ResolvedEntity<Tenant>> {
  if (!name || name.trim().length < 2) {
    return { match: null, confidence: 0 };
  }

  const searchTerm = name.trim();

  const exact = await prisma.tenant.findFirst({
    where: {
      OR: [
        { name: { equals: searchTerm, mode: 'insensitive' } },
        { slug: { equals: searchTerm, mode: 'insensitive' } },
      ],
    },
  });

  if (exact) {
    return { match: exact, confidence: 1.0 };
  }

  const partial = await prisma.tenant.findFirst({
    where: {
      OR: [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { slug: { contains: searchTerm, mode: 'insensitive' } },
      ],
    },
  });

  return partial
    ? { match: partial, confidence: 0.7 }
    : { match: null, confidence: 0 };
}

/**
 * Resolve a deal by name within a tenant's diagnostics.
 */
export async function resolveDealByName(
  tenantId: string,
  name: string
): Promise<ResolvedEntity<DealDiagnostic>> {
  if (!name || name.trim().length < 2) {
    return { match: null, confidence: 0 };
  }

  const searchTerm = name.trim();

  const match = await prisma.dealDiagnostic.findFirst({
    where: {
      tenantId,
      dealName: { contains: searchTerm, mode: 'insensitive' },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return match
    ? { match, confidence: 0.8 }
    : { match: null, confidence: 0 };
}

/**
 * Resolve leads by grade filter.
 */
export async function resolveLeadsByGrade(
  tenantId: string,
  grade: string,
  limit: number = 10
): Promise<Lead[]> {
  return prisma.lead.findMany({
    where: {
      tenantId,
      fulcrumGrade: grade,
      status: { in: ['pending_review', 'discovered'] },
    },
    orderBy: { fulcrumScore: 'desc' },
    take: limit,
  });
}

/**
 * Get recent leads for a tenant (last 24h or last N).
 */
export async function getRecentLeads(
  tenantId: string,
  limit: number = 10
): Promise<Lead[]> {
  return prisma.lead.findMany({
    where: { tenantId },
    orderBy: { discoveredAt: 'desc' },
    take: limit,
  });
}
