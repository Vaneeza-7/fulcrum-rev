import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateConfig } from '@/lib/onboarding/generate-config'
import type { ICPContext } from '@/lib/onboarding/generate-config'
import { initializeColdStart } from '@/lib/cold-start'
import { checkRateLimit } from '@/lib/rate-limit'

const SCORING_CONFIG_TYPES = [
  'company_size',
  'industry_fit',
  'role_authority',
  'revenue_signals',
] as const

export async function POST() {
  try {
    const { orgId } = await auth()
    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit: 3 requests per minute per org (AI calls are expensive)
    const rl = checkRateLimit(`generate:${orgId}`, { windowMs: 60_000, maxRequests: 3 })
    if (rl.limited) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait before trying again.' },
        { status: 429 }
      )
    }

    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
    })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // Load profile and competitors
    const profile = await prisma.tenantProfile.findUnique({
      where: { tenantId: tenant.id },
    })
    if (!profile) {
      return NextResponse.json(
        { error: 'Tenant profile not found. Complete company profile step first.' },
        { status: 400 }
      )
    }

    const competitors = await prisma.tenantCompetitor.findMany({
      where: { tenantId: tenant.id },
    })

    // Build ICPContext from profile + competitors
    const context: ICPContext = {
      companyName: profile.companyName,
      websiteUrl: profile.websiteUrl,
      industry: profile.industry,
      companySize: profile.companySize,
      productDescription: profile.productDescription,
      problemsSolved: profile.problemsSolved,
      valueProposition: profile.valueProposition,
      targetIndustries: (profile.targetIndustries as string[]) ?? [],
      targetCompanySizes: (profile.targetCompanySizes as string[]) ?? [],
      targetRoles: (profile.targetRoles as string[]) ?? [],
      targetGeography: (profile.targetGeography as string[]) ?? [],
      painPoints: profile.painPoints,
      buyingSignals: profile.buyingSignals,
      searchKeywords: profile.searchKeywords,
      competitors: competitors.map((c) => ({
        name: c.name,
        websiteUrl: c.websiteUrl,
        differentiator: c.differentiator,
      })),
      competitorDifferentiation: profile.competitorDifferentiation,
      whyChooseUs: profile.whyChooseUs,
    }

    // Generate config via AI with timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55_000) // 55s (under Vercel 60s limit)
    let generated
    try {
      generated = await generateConfig(context)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return NextResponse.json({ error: 'AI config generation timed out. Please try again.' }, { status: 504 })
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }

    // Persist generated config in a transaction
    await prisma.$transaction(async (tx) => {
      // Search queries: replace-all
      await tx.tenantSearchQuery.deleteMany({
        where: { tenantId: tenant.id },
      })
      await tx.tenantSearchQuery.createMany({
        data: generated.searchQueries.map((q) => ({
          tenantId: tenant.id,
          queryName: q.queryName,
          searchQuery: q.searchQuery as any,
          maxResults: q.maxResults,
        })),
      })

      // Intent keywords: replace-all
      await tx.tenantIntentKeyword.deleteMany({
        where: { tenantId: tenant.id },
      })
      await tx.tenantIntentKeyword.createMany({
        data: generated.intentKeywords.map((k) => ({
          tenantId: tenant.id,
          keyword: k.keyword,
          intentScore: k.intentScore,
          category: k.category,
        })),
      })

      // Scoring configs: upsert each type
      for (const configType of SCORING_CONFIG_TYPES) {
        const configData = generated.scoringConfig[configType]
        if (configData) {
          await tx.tenantScoringConfig.upsert({
            where: {
              tenantId_configType: {
                tenantId: tenant.id,
                configType,
              },
            },
            create: {
              tenantId: tenant.id,
              configType,
              configData: configData as any,
            },
            update: {
              configData: configData as any,
            },
          })
        }
      }
    })

    // Initialize cold-start (non-fatal)
    try {
      await initializeColdStart(tenant.id)
    } catch (err) {
      console.error('Cold-start initialization failed (non-fatal):', err)
    }

    return NextResponse.json({
      searchQueries: generated.searchQueries,
      intentKeywords: generated.intentKeywords,
      scoringConfig: generated.scoringConfig,
    })
  } catch (error) {
    console.error('generate-and-launch error:', error)
    return NextResponse.json({ error: 'Failed to generate pipeline configuration' }, { status: 500 })
  }
}
