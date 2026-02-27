import { prisma } from '../db';
import { initializeColdStart } from '@/lib/cold-start';

export interface TenantSeedConfig {
  name: string;
  slug: string;
  productType: string;
  crmType: string;
  crmConfig: Record<string, unknown>;
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

// ============================================================================
// HUNHU CONFIGURATION (K-12 Education)
// ============================================================================
export const HUNHU_CONFIG: TenantSeedConfig = {
  name: 'Hunhu',
  slug: 'hunhu',
  productType: 'hunhu',
  crmType: 'zoho',
  crmConfig: {},
  searchQueries: [
    {
      queryName: 'Superintendent Search',
      searchQuery: {
        keywords: 'Superintendent',
        industry: 'School District',
        companySize: '501-5000',
        additionalKeywords: 'student wellbeing OR mental health',
      },
    },
    {
      queryName: 'Director of Student Services',
      searchQuery: {
        keywords: 'Director of Student Services',
        industry: 'School District',
        companySize: '501-5000',
      },
    },
    {
      queryName: 'Principal Search',
      searchQuery: {
        keywords: 'Principal',
        industry: 'School',
        companySize: '201-1000',
        additionalKeywords: 'mental health',
      },
    },
  ],
  intentKeywords: [
    { keyword: 'student mental health crisis', intentScore: 9, category: 'crisis' },
    { keyword: 'SEL assessment tools', intentScore: 9, category: 'tools' },
    { keyword: 'early warning system schools', intentScore: 8, category: 'tools' },
    { keyword: 'suicide prevention schools', intentScore: 10, category: 'crisis' },
    { keyword: 'attendance intervention software', intentScore: 8, category: 'tools' },
    { keyword: 'student wellbeing tracking', intentScore: 7, category: 'tools' },
    { keyword: 'MTSS implementation', intentScore: 6, category: 'framework' },
    { keyword: 'social emotional learning data', intentScore: 7, category: 'data' },
  ],
  scoringConfig: {
    company_size: [
      { min: 51, max: 500, points: 10 },
      { min: 501, max: 5000, points: 7 },
      { min: 1, max: 50, points: 3 },
    ],
    industry_fit: [
      { match: 'perfect', points: 8 },
      { match: 'adjacent', points: 5 },
      { match: 'neutral', points: 3 },
    ],
    role_authority: [
      { pattern: 'c_level', points: 15 },
      { pattern: 'vp_director', points: 12 },
      { pattern: 'manager', points: 7 },
      { pattern: 'ic', points: 3 },
    ],
    revenue_signals: [
      { signal: 'series_a', points: 7 },
      { signal: 'seed', points: 5 },
      { signal: 'budget_season', points: 3 },
    ],
  },
};

// ============================================================================
// PULSE CONFIGURATION (SaaS Analytics)
// ============================================================================
export const PULSE_CONFIG: TenantSeedConfig = {
  name: 'Pulse',
  slug: 'pulse',
  productType: 'pulse',
  crmType: 'zoho',
  crmConfig: {},
  searchQueries: [
    {
      queryName: 'Founder/CEO/CTO Search',
      searchQuery: {
        keywords: 'Founder OR CEO OR CTO',
        industry: 'Software Development',
        companySize: '1-50',
        additionalKeywords: 'SaaS OR B2B',
      },
    },
    {
      queryName: 'VP Product Search',
      searchQuery: {
        keywords: 'VP Product OR Head of Product',
        industry: 'Software Development',
        companySize: '1-50',
        additionalKeywords: 'customer success',
      },
    },
    {
      queryName: 'Revenue Leader Search',
      searchQuery: {
        keywords: 'Head of Revenue OR VP Sales',
        industry: 'Software Development',
        companySize: '1-500',
        additionalKeywords: 'revenue operations',
      },
    },
  ],
  intentKeywords: [
    { keyword: 'reduce SaaS churn', intentScore: 9, category: 'churn' },
    { keyword: 'predictive churn model', intentScore: 9, category: 'churn' },
    { keyword: 'CRM analytics for startups', intentScore: 8, category: 'analytics' },
    { keyword: 'customer health score', intentScore: 8, category: 'analytics' },
    { keyword: 'revenue forecasting SaaS', intentScore: 7, category: 'revenue' },
    { keyword: 'product analytics integration', intentScore: 7, category: 'analytics' },
    { keyword: 'sales intelligence platform', intentScore: 6, category: 'tools' },
    { keyword: 'SaaS metrics dashboard', intentScore: 6, category: 'analytics' },
  ],
  scoringConfig: {
    company_size: [
      { min: 1, max: 50, points: 10 },
      { min: 51, max: 200, points: 7 },
      { min: 201, max: 500, points: 5 },
    ],
    industry_fit: [
      { match: 'perfect', points: 8 },
      { match: 'adjacent', points: 5 },
      { match: 'neutral', points: 3 },
    ],
    role_authority: [
      { pattern: 'c_level', points: 15 },
      { pattern: 'vp_director', points: 12 },
      { pattern: 'manager', points: 7 },
      { pattern: 'ic', points: 3 },
    ],
    revenue_signals: [
      { signal: 'series_a', points: 7 },
      { signal: 'seed', points: 5 },
      { signal: 'budget_season', points: 3 },
    ],
  },
};
