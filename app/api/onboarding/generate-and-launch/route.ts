import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateConfig } from '@/lib/onboarding/generate-config'
import type { ICPContext } from '@/lib/onboarding/generate-config'
import { initializeColdStart } from '@/lib/cold-start'
import { checkRateLimit } from '@/lib/rate-limit'
import { resolveAnthropicCredentials } from '@/lib/settings/api-keys'
import { replaceTenantSearchQueries } from '@/lib/settings/search-queries'
import { replaceTenantIntentKeywords } from '@/lib/settings/intent-keywords'
import { upsertTenantScoringConfig } from '@/lib/settings/scoring'

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

    const anthropicCredentials = resolveAnthropicCredentials({
      anthropicApiKey: tenant.anthropicApiKey,
    })

    // Generate config via AI with timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55_000) // 55s (under Vercel 60s limit)
    let generated
    try {
      generated = await generateConfig(context, {
        apiKey: anthropicCredentials.apiKey ?? undefined,
        timeoutMs: 55_000,
        signal: controller.signal,
        billingContext: {
          tenantId: tenant.id,
          provider: 'anthropic',
          feature: 'onboarding',
          stage: 'onboarding.generate_config',
        },
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return NextResponse.json({ error: 'AI config generation timed out. Please try again.' }, { status: 504 })
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }

    try {
      await prisma.$transaction(async (tx) => {
        await replaceTenantSearchQueries(tx, tenant.id, generated.searchQueries)
        await replaceTenantIntentKeywords(tx, tenant.id, generated.intentKeywords)
        await upsertTenantScoringConfig(tx, tenant.id, generated.scoringConfig)
      })
    } catch {
      return NextResponse.json(
        { error: 'AI generated an invalid launch configuration. Please try again.' },
        { status: 502 },
      )
    }

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
