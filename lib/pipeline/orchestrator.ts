import { prisma, auditLog } from '@/lib/db';
import { scrapeForTenant } from './scraper';
import { deduplicateProfiles } from './deduplicator';
import { enrichProfile } from './enricher';
import { detectSignals } from './signal-detector';
import { scoreLead } from './scorer';
import { generateFirstLine } from './first-line';
import { PipelineResult } from './types';
import { ROISourceTagger } from '@/lib/roi/source-tagger';
import { FulcrumSourceType } from '@prisma/client';
import { ColdStartGate } from '@/lib/cold-start';
import { jobLogger } from '@/lib/logger';
import { pushLeadToCRM } from '@/lib/jobs/crm-push';
import { sendPipelineSummary } from '@/lib/slack/client';
import { SlackLeadCard, SlackPipelineSummary } from '@/lib/slack/types';

const log = jobLogger('pipeline-orchestrator');

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
    return buildResult(tenantId, 0, 0, 0, 0, 0, 0, [], gradeDistribution, errors, startTime);
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
    return buildResult(tenantId, profiles.length, 0, 0, 0, 0, 0, [], gradeDistribution, errors, startTime);
  }

  // Cold-start check — gate actions for new tenants
  const coldStartStatus = await ColdStartGate.getStatus(tenantId);
  if (coldStartStatus.isActive) {
    log.info(
      { tenantId, daysRemaining: coldStartStatus.daysRemaining, confidenceFloorBoost: coldStartStatus.confidenceFloorBoost },
      'Cold-start active: leads will require manual approval',
    );
  }

  let enrichedCount = 0;
  let scoredCount = 0;
  let firstLineCount = 0;
  const createdLeadRecords: Array<{
    id: string; fullName: string; title: string; company: string;
    fulcrumScore: number; fulcrumGrade: string; fitScore: number;
    intentScore: number; firstLine: string; linkedinUrl: string;
  }> = [];

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

      // Cold-start confidence adjustment
      const adjustedConfidence = coldStartStatus.isActive
        ? ColdStartGate.applyConfidenceBoost(score.fulcrum_score / 100, coldStartStatus.confidenceFloorBoost)
        : score.fulcrum_score / 100;

      // In cold-start: all leads require manual approval
      const leadStatus = coldStartStatus.isActive ? 'awaiting_approval' : 'pending_review';

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
          scoreBreakdown: {
            ...(score.breakdown as any),
            ...(coldStartStatus.isActive ? {
              coldStartFlag: true,
              coldStartReason: 'Cold-start: manual approval required',
              adjustedConfidence,
            } : {}),
          },
          scoredAt: new Date(),
          firstLine: firstLine || null,
          firstLineGeneratedAt: firstLine ? new Date() : null,
          status: leadStatus,
        },
      });

      createdLeadRecords.push({
        id: lead.id,
        fullName: profile.full_name,
        title: profile.title ?? '',
        company: profile.company ?? '',
        fulcrumScore: score.fulcrum_score,
        fulcrumGrade: score.fulcrum_grade,
        fitScore: score.fit_score,
        intentScore: score.intent_score,
        firstLine,
        linkedinUrl: profile.linkedin_url,
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

      // Tag lead as Fulcrum-sourced for ROI attribution.
      // Pipeline-discovered leads are RESEARCHER_DISCOVERY by default.
      // Other agents (ICP Analyst, Signal Intelligence, Resurrection) will
      // call tagLead with their respective FulcrumSourceType when they exist.
      try {
        await ROISourceTagger.tagLead({
          tenantId,
          tenantSlug: tenant.slug,
          leadId: lead.id,
          sourceType: FulcrumSourceType.RESEARCHER_DISCOVERY,
        });
      } catch (tagError) {
        console.error(`[Pipeline] ROI source tagging failed for ${lead.id}:`, tagError);
      }
    } catch (error) {
      const msg = `Failed processing ${profile.full_name}: ${error}`;
      errors.push(msg);
      console.error(msg);
    }
  }

  // 8. AUTO-PUSH high-scoring leads to CRM (B grade and above)
  let pushedCount = 0;
  const pushErrors: string[] = [];
  const crmLeadIds = new Map<string, string>(); // leadId -> crmLeadId

  if (tenant.crmType && tenant.crmConfig) {
    for (const rec of createdLeadRecords) {
      if (rec.fulcrumScore >= 60) {
        try {
          const result = await pushLeadToCRM(rec.id);
          if (result.success && result.crmLeadId) {
            pushedCount++;
            crmLeadIds.set(rec.id, result.crmLeadId);
          } else if (result.error) {
            pushErrors.push(result.error);
          }
        } catch (err) {
          pushErrors.push(`CRM push failed for ${rec.fullName}: ${err}`);
        }
      }
    }
  }

  // 9. SLACK NOTIFICATION
  const crmCfg = tenant.crmConfig as Record<string, unknown>;
  const zohoOrgId = crmCfg?.org_id as string | undefined;
  const zohoCustomViewUrl = crmCfg?.custom_view_url as string | undefined;
  const topLeads: SlackLeadCard[] = createdLeadRecords
    .sort((a, b) => b.fulcrumScore - a.fulcrumScore)
    .slice(0, 10)
    .map((l) => ({
      lead_id: l.id,
      full_name: l.fullName,
      title: l.title,
      company: l.company,
      fulcrum_score: l.fulcrumScore,
      fulcrum_grade: l.fulcrumGrade,
      fit_score: l.fitScore,
      intent_score: l.intentScore,
      first_line: l.firstLine,
      linkedin_url: l.linkedinUrl,
      crm_lead_id: crmLeadIds.get(l.id),
    }));

  const slackSummary: SlackPipelineSummary = {
    tenant_name: tenant.name,
    profiles_scraped: profiles.length,
    profiles_new: newProfiles.length,
    grade_distribution: gradeDistribution,
    top_leads: topLeads,
    errors: [...errors, ...pushErrors],
    zoho_org_id: zohoOrgId,
    zoho_leads_url: zohoCustomViewUrl
      ?? (zohoOrgId ? `https://crm.zoho.com/crm/org${zohoOrgId}/tab/Leads` : undefined),
  };

  try {
    await sendPipelineSummary(tenantId, slackSummary);
  } catch (slackErr) {
    log.error({ err: slackErr }, 'Failed to send Slack pipeline summary');
  }

  await auditLog(tenantId, 'pipeline_completed', undefined, {
    scraped: profiles.length,
    new: newProfiles.length,
    enriched: enrichedCount,
    scored: scoredCount,
    firstLines: firstLineCount,
    pushedToCrm: pushedCount,
    grades: gradeDistribution,
  });

  return buildResult(
    tenantId,
    profiles.length,
    newProfiles.length,
    enrichedCount,
    scoredCount,
    firstLineCount,
    pushedCount,
    pushErrors,
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
  pushedToCrm: number,
  crmPushErrors: string[],
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
    leads_pushed_to_crm: pushedToCrm,
    crm_push_errors: crmPushErrors,
    grade_distribution: grades,
    errors,
    duration_ms: Date.now() - startTime,
  };
}
