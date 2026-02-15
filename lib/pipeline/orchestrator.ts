import { prisma, auditLog } from '@/lib/db';
import { scrapeForTenant } from './scraper';
import { deduplicateProfiles } from './deduplicator';
import { enrichProfile } from './enricher';
import { detectSignals } from './signal-detector';
import { scoreLead } from './scorer';
import { generateFirstLine } from './first-line';
import { PipelineResult } from './types';

/**
 * Run the full lead generation pipeline for a single tenant.
 * Stages: Scrape → Dedup → Enrich → Detect Signals → Score → First Line → Store
 */
export async function runPipelineForTenant(tenantId: string): Promise<PipelineResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const gradeDistribution: Record<string, number> = {};

  await auditLog(tenantId, 'pipeline_started');

  // Load tenant config
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    include: {
      searchQueries: { where: { isActive: true } },
      intentKeywords: { where: { isActive: true } },
    },
  });

  // 1. SCRAPE - Run LinkedIn searches
  const queries = tenant.searchQueries.map((q) => ({
    searchQuery: q.searchQuery as Record<string, unknown>,
    maxResults: q.maxResults,
  }));

  let profiles;
  try {
    profiles = await scrapeForTenant(queries);
  } catch (error) {
    const msg = `Scraping failed: ${error}`;
    errors.push(msg);
    await auditLog(tenantId, 'pipeline_error', undefined, { stage: 'scrape', error: msg });
    return buildResult(tenantId, 0, 0, 0, 0, 0, gradeDistribution, errors, startTime);
  }

  // 2. DEDUP - Filter existing leads
  const { newProfiles, duplicateCount } = await deduplicateProfiles(tenantId, profiles);

  await auditLog(tenantId, 'pipeline_dedup', undefined, {
    total: profiles.length,
    new: newProfiles.length,
    duplicates: duplicateCount,
  });

  if (newProfiles.length === 0) {
    await auditLog(tenantId, 'pipeline_completed', undefined, { reason: 'no_new_profiles' });
    return buildResult(tenantId, profiles.length, 0, 0, 0, 0, gradeDistribution, errors, startTime);
  }

  let enrichedCount = 0;
  let scoredCount = 0;
  let firstLineCount = 0;

  // Process each new profile through the pipeline
  for (const profile of newProfiles) {
    try {
      // 3. ENRICH
      const enrichment = await enrichProfile(profile);
      enrichedCount++;

      // 4. DETECT SIGNALS
      const keywords = tenant.intentKeywords.map((k) => ({
        keyword: k.keyword,
        intentScore: Number(k.intentScore),
      }));
      const signals = await detectSignals(enrichment, keywords);

      // 5. SCORE
      const score = await scoreLead(tenantId, enrichment, signals);
      scoredCount++;

      // Track grade distribution
      gradeDistribution[score.fulcrum_grade] = (gradeDistribution[score.fulcrum_grade] ?? 0) + 1;

      // 6. FIRST LINE (only for B grade and above)
      let firstLine = '';
      if (score.fulcrum_score >= 60) {
        firstLine = await generateFirstLine(profile, enrichment, tenant.productType);
        if (firstLine) firstLineCount++;
      }

      // 7. STORE - Create lead record
      const lead = await prisma.lead.create({
        data: {
          tenantId,
          linkedinUrl: profile.linkedin_url,
          fullName: profile.full_name,
          title: profile.title,
          company: profile.company,
          location: profile.location,
          profileData: profile.profile_data as any,
          enrichmentData: enrichment as any,
          enrichedAt: new Date(),
          fitScore: score.fit_score,
          intentScore: score.intent_score,
          fulcrumScore: score.fulcrum_score,
          fulcrumGrade: score.fulcrum_grade,
          scoreBreakdown: score.breakdown as any,
          scoredAt: new Date(),
          firstLine: firstLine || null,
          firstLineGeneratedAt: firstLine ? new Date() : null,
          status: 'pending_review',
        },
      });

      // Store intent signals
      if (signals.length > 0) {
        await prisma.intentSignal.createMany({
          data: signals.map((s) => ({
            tenantId,
            leadId: lead.id,
            signalType: s.signal_type,
            signalValue: s.signal_value,
            signalScore: s.signal_score,
            detectedAt: new Date(s.detected_at),
          })),
        });
      }
    } catch (error) {
      const msg = `Failed processing ${profile.full_name}: ${error}`;
      errors.push(msg);
      console.error(msg);
    }
  }

  await auditLog(tenantId, 'pipeline_completed', undefined, {
    scraped: profiles.length,
    new: newProfiles.length,
    enriched: enrichedCount,
    scored: scoredCount,
    firstLines: firstLineCount,
    grades: gradeDistribution,
  });

  return buildResult(
    tenantId,
    profiles.length,
    newProfiles.length,
    enrichedCount,
    scoredCount,
    firstLineCount,
    gradeDistribution,
    errors,
    startTime
  );
}

function buildResult(
  tenantId: string,
  scraped: number,
  newCount: number,
  enriched: number,
  scored: number,
  firstLines: number,
  grades: Record<string, number>,
  errors: string[],
  startTime: number
): PipelineResult {
  return {
    tenant_id: tenantId,
    profiles_scraped: scraped,
    profiles_new: newCount,
    profiles_enriched: enriched,
    profiles_scored: scored,
    first_lines_generated: firstLines,
    grade_distribution: grades,
    errors,
    duration_ms: Date.now() - startTime,
  };
}
