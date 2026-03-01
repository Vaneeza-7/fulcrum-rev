import { prisma } from '../db';
import { initializeColdStart } from '@/lib/cold-start';

export interface TenantSeedConfig {
  clerkOrgId?: string;
  name: string;
  slug: string;
  productType: string;
  crmType?: string;
  crmConfig?: Record<string, unknown>;
  searchQueries: Array<{
    queryName: string;
    searchQuery: Record<string, unknown>;
    maxResults?: number;
  }>;
  intentKeywords: Array<{
    keyword: string;
    intentScore: number;
    category?: string;
  }>;
  scoringConfig: {
    company_size: Array<{ min: number; max: number; points: number }>;
    industry_fit: Array<{ match: string; points: number }>;
    role_authority: Array<{ pattern: string; points: number }>;
    revenue_signals: Array<{ signal: string; points: number }>;
  };
}

/**
 * Seed a new tenant with all configuration.
 * This is the reusable function for onboarding any new customer.
 * Adding customer #10 = calling this function with their config.
 */
export async function seedTenant(config: TenantSeedConfig): Promise<string> {
  const tenant = await prisma.tenant.create({
    data: {
      clerkOrgId: config.clerkOrgId,
      name: config.name,
      slug: config.slug,
      productType: config.productType,
      crmType: config.crmType,
      crmConfig: config.crmConfig as any,
    },
  });

  // Search queries
  await prisma.tenantSearchQuery.createMany({
    data: config.searchQueries.map((q) => ({
      tenantId: tenant.id,
      queryName: q.queryName,
      searchQuery: q.searchQuery as any,
      maxResults: q.maxResults ?? 10,
    })),
  });

  // Intent keywords
  await prisma.tenantIntentKeyword.createMany({
    data: config.intentKeywords.map((k) => ({
      tenantId: tenant.id,
      keyword: k.keyword,
      intentScore: k.intentScore,
      category: k.category,
    })),
  });

  // Scoring configs (one row per config type)
  const scoringTypes = ['company_size', 'industry_fit', 'role_authority', 'revenue_signals'] as const;
  await prisma.tenantScoringConfig.createMany({
    data: scoringTypes.map((type) => ({
      tenantId: tenant.id,
      configType: type,
      configData: config.scoringConfig[type] as any,
    })),
  });

  // Initialize cold-start state (non-fatal — tenant creation must not fail)
  try {
    await initializeColdStart(tenant.id);
  } catch (err) {
    console.error(`[seed-tenant] Failed to initialize cold-start for ${tenant.id}:`, err);
  }

  console.log(`Tenant "${config.name}" seeded with ID: ${tenant.id}`);
  return tenant.id;
}
