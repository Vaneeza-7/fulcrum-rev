import { prisma, auditLog } from '@/lib/db';
import { ClosedWonDeal, AttributionProof, TrackerStatus } from './types';

/**
 * Commission Tracker — core module for monitoring CRM closed-won deals
 * and matching them to Fulcrum-sourced leads.
 *
 * Flow:
 * 1. Scan CRM for new closed-won deals
 * 2. Fuzzy-match each deal to a Fulcrum lead (by company name or CRM lead ID)
 * 3. Create CommissionTracker record with Match 1 (CRM) completed
 * 4. Build attribution proof linking the deal back to Fulcrum's lead discovery
 */

const FUZZY_MATCH_THRESHOLD = 0.85;

/**
 * Process a batch of closed-won deals from CRM scan.
 * Creates CommissionTracker records for new deals and builds attribution proof.
 */
export async function processClosedWonDeals(
  tenantId: string,
  deals: ClosedWonDeal[]
): Promise<{ tracked: number; skipped: number; ineligible: number }> {
  let tracked = 0;
  let skipped = 0;
  let ineligible = 0;

  for (const deal of deals) {
    // Skip if already tracked
    const existing = await prisma.commissionTracker.findUnique({
      where: { tenantId_crmDealId: { tenantId, crmDealId: deal.crmDealId } },
    });
    if (existing) {
      skipped++;
      continue;
    }

    // Check pre-existing deals exclusion
    const preExisting = await prisma.preExistingDeal.findUnique({
      where: { tenantId_crmDealId: { tenantId, crmDealId: deal.crmDealId } },
    });
    if (preExisting && preExisting.status === 'ineligible') {
      ineligible++;
      continue;
    }

    // Build attribution proof by matching to Fulcrum leads
    const attribution = await buildAttributionProof(tenantId, deal);

    // Create tracker with Match 1 complete
    await prisma.commissionTracker.create({
      data: {
        tenantId,
        crmDealId: deal.crmDealId,
        dealName: deal.dealName,
        dealValue: deal.dealValue,
        customerName: deal.customerName,
        closedWonAt: deal.closedWonAt,
        match1Crm: true,
        match1At: new Date(),
        fulcrumAlertAt: attribution.fulcrumAlertAt ? new Date(attribution.fulcrumAlertAt) : null,
        firstCrmActivityAt: attribution.firstCrmActivityAt ? new Date(attribution.firstCrmActivityAt) : null,
        attributionProof: attribution as any,
        status: 'match_1_complete' as TrackerStatus,
      },
    });

    await auditLog(tenantId, 'icm_deal_tracked', deal.crmDealId, {
      dealName: deal.dealName,
      dealValue: deal.dealValue,
      matchMethod: attribution.matchMethod,
      matchConfidence: attribution.matchConfidence,
    });

    tracked++;
  }

  return { tracked, skipped, ineligible };
}

/**
 * Build attribution proof by matching a closed-won deal to a Fulcrum lead.
 *
 * Match methods (in priority order):
 * 1. Exact CRM lead ID match — lead was pushed to CRM by Fulcrum
 * 2. Company name fuzzy match — deal's customer matches a lead's company
 * 3. Contact name fuzzy match — deal's contact matches a lead name
 */
async function buildAttributionProof(
  tenantId: string,
  deal: ClosedWonDeal
): Promise<AttributionProof> {
  // Try matching by company name across all pushed leads
  if (deal.customerName) {
    const companyMatch = await findLeadByCompanyFuzzy(tenantId, deal.customerName);
    if (companyMatch) {
      const contentAssetIds = await getContentAttribution(tenantId, companyMatch.id);
      return {
        fulcrumLeadId: companyMatch.id,
        fulcrumAlertAt: companyMatch.discoveredAt.toISOString(),
        firstCrmActivityAt: companyMatch.pushedToCrmAt?.toISOString() ?? null,
        leadDiscoveredAt: companyMatch.discoveredAt.toISOString(),
        leadPushedToCrmAt: companyMatch.pushedToCrmAt?.toISOString() ?? null,
        matchMethod: companyMatch.crmLeadId ? 'exact_crm_id' : 'company_fuzzy',
        matchConfidence: companyMatch.crmLeadId ? 1.0 : 0.85,
        matchedLeadName: companyMatch.fullName,
        matchedCompany: companyMatch.company ?? undefined,
        contentAssetIds: contentAssetIds.length > 0 ? contentAssetIds : undefined,
      };
    }
  }

  // Method 3: Contact name fuzzy match
  if (deal.contactName) {
    const nameMatch = await findLeadByNameFuzzy(tenantId, deal.contactName);
    if (nameMatch) {
      const contentAssetIds = await getContentAttribution(tenantId, nameMatch.id);
      return {
        fulcrumLeadId: nameMatch.id,
        fulcrumAlertAt: nameMatch.discoveredAt.toISOString(),
        firstCrmActivityAt: nameMatch.pushedToCrmAt?.toISOString() ?? null,
        leadDiscoveredAt: nameMatch.discoveredAt.toISOString(),
        leadPushedToCrmAt: nameMatch.pushedToCrmAt?.toISOString() ?? null,
        matchMethod: 'contact_name_fuzzy',
        matchConfidence: 0.75,
        matchedLeadName: nameMatch.fullName,
        matchedCompany: nameMatch.company ?? undefined,
        contentAssetIds: contentAssetIds.length > 0 ? contentAssetIds : undefined,
      };
    }
  }

  // No match found — deal is still tracked but attribution is unproven
  return {
    fulcrumLeadId: null,
    fulcrumAlertAt: null,
    firstCrmActivityAt: null,
    leadDiscoveredAt: null,
    leadPushedToCrmAt: null,
    matchMethod: 'no_match',
    matchConfidence: 0,
  };
}

/**
 * Check if a matched lead was influenced by content engagement.
 * Looks for content_engagement or pricing_page_visit signals on the lead,
 * then traces back to ContentAsset records to build content attribution.
 */
async function getContentAttribution(
  tenantId: string,
  leadId: string
): Promise<string[]> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { intentSignals: true },
  });

  if (!lead?.intentSignals) return [];

  const signals = lead.intentSignals as unknown as Array<{ signal_type: string; signal_value?: { url?: string } }>;
  const contentSignalTypes = ['content_engagement', 'pricing_page_visit', 'multi_page_session'];
  const contentSignals = signals.filter((s) => contentSignalTypes.includes(s.signal_type));

  if (contentSignals.length === 0) return [];

  // Find content assets that match the URLs from engagement signals
  const urls = contentSignals
    .map((s) => s.signal_value?.url)
    .filter((u): u is string => !!u);

  if (urls.length === 0) {
    // No URLs in signals — check if any content assets belong to this tenant
    return [];
  }

  const matchedAssets = await prisma.contentAsset.findMany({
    where: { tenantId, url: { in: urls } },
    select: { id: true },
  });

  return matchedAssets.map((a) => a.id);
}

/**
 * Fuzzy match a deal's customer name to a Fulcrum lead's company.
 * Uses ILIKE for case-insensitive matching + Levenshtein distance for fuzzy.
 */
async function findLeadByCompanyFuzzy(tenantId: string, customerName: string) {
  const normalized = customerName.trim();
  if (!normalized) return null;

  // Exact match first
  const exact = await prisma.lead.findFirst({
    where: {
      tenantId,
      company: { equals: normalized, mode: 'insensitive' },
      status: { in: ['pushed_to_crm', 'approved', 'discovered', 'pending_review'] },
    },
    orderBy: { fulcrumScore: 'desc' },
  });
  if (exact) return exact;

  // Contains match (handles "Acme" matching "Acme Corp" or "Acme Inc")
  const partial = await prisma.lead.findFirst({
    where: {
      tenantId,
      OR: [
        { company: { contains: normalized, mode: 'insensitive' } },
        // Also check if the deal's customer name contains the lead's company
        // This handles "Acme Corporation" matching a lead at "Acme"
      ],
      status: { in: ['pushed_to_crm', 'approved', 'discovered', 'pending_review'] },
    },
    orderBy: { fulcrumScore: 'desc' },
  });
  if (partial) return partial;

  // Try matching with common suffixes stripped
  const stripped = stripCompanySuffix(normalized);
  if (stripped !== normalized) {
    const strippedMatch = await prisma.lead.findFirst({
      where: {
        tenantId,
        company: { contains: stripped, mode: 'insensitive' },
        status: { in: ['pushed_to_crm', 'approved', 'discovered', 'pending_review'] },
      },
      orderBy: { fulcrumScore: 'desc' },
    });
    if (strippedMatch) return strippedMatch;
  }

  return null;
}

/**
 * Fuzzy match a deal's contact name to a Fulcrum lead's name.
 */
async function findLeadByNameFuzzy(tenantId: string, contactName: string) {
  const normalized = contactName.trim();
  if (!normalized) return null;

  // Exact name match
  const exact = await prisma.lead.findFirst({
    where: {
      tenantId,
      fullName: { equals: normalized, mode: 'insensitive' },
    },
    orderBy: { fulcrumScore: 'desc' },
  });
  if (exact) return exact;

  // Partial name match
  const partial = await prisma.lead.findFirst({
    where: {
      tenantId,
      fullName: { contains: normalized, mode: 'insensitive' },
    },
    orderBy: { fulcrumScore: 'desc' },
  });

  return partial;
}

/**
 * Strip common company suffixes for fuzzy matching.
 */
function stripCompanySuffix(name: string): string {
  const suffixes = [
    /\s+(inc\.?|incorporated)$/i,
    /\s+(corp\.?|corporation)$/i,
    /\s+(ltd\.?|limited)$/i,
    /\s+(llc|l\.l\.c\.?)$/i,
    /\s+(co\.?|company)$/i,
    /\s+(plc|p\.l\.c\.?)$/i,
    /\s+(gmbh)$/i,
    /\s+(pty\.?\s*ltd\.?)$/i,
  ];

  let result = name;
  for (const suffix of suffixes) {
    result = result.replace(suffix, '');
  }
  return result.trim();
}
