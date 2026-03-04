import { describe, it, expect } from 'vitest';
import {
  buildPipelineSummaryBlocks,
  buildLeadReviewBlocks,
  buildDealAlertBlocks,
  buildStatusBlocks,
  buildReconciliationSummaryBlocks,
  buildCommissionAlertBlocks,
  buildSEOAuditBlocks,
  buildContentAllocationBlocks,
  buildContentROIBlocks,
  buildPersonaSnippetBlocks,
  buildCROReportBlocks,
  buildSaturationAlertBlocks,
} from '@/lib/slack/blocks';

describe('buildPipelineSummaryBlocks', () => {
  it('produces valid blocks with leads and grade distribution', () => {
    const blocks = buildPipelineSummaryBlocks({
      tenant_id: 'tenant-123',
      tenant_name: 'Hunhu',
      profiles_scraped: 50,
      profiles_new: 12,
      grade_distribution: { 'A+': 2, A: 3, B: 4, C: 2, D: 1 },
      top_leads: [
        {
          tenant_id: 'tenant-123',
          lead_id: 'lead-001',
          full_name: 'Jane Smith',
          title: 'Superintendent',
          company: 'Springfield USD',
          fulcrum_score: 92,
          fulcrum_grade: 'A+',
          fit_score: 35,
          intent_score: 55,
          first_line: 'Your student wellbeing program is inspiring.',
          linkedin_url: 'https://linkedin.com/in/janesmith',
        },
      ],
      errors: [],
    });

    expect(blocks.length).toBeGreaterThan(3);
    expect(blocks[0]).toHaveProperty('type', 'header');
    const actions = blocks.find((b: any) => b.type === 'actions');
    expect(actions).toBeDefined();
    const actionElements = (actions as any).elements;
    expect(actionElements).toHaveLength(3);
    expect(actionElements[0].action_id).toBe('push_all_aplus');
    expect(actionElements[0].text.text).toBe('Approve All A+');
    expect(JSON.parse(actionElements[0].value)).toEqual({ tenantId: 'tenant-123', grades: ['A+'] });
    expect(actionElements[1].action_id).toBe('review_leads');
    expect(JSON.parse(actionElements[1].value)).toEqual({ tenantId: 'tenant-123' });
    expect(actionElements[2].action_id).toBe('reject_grade');
  });

  it('includes error context when errors present', () => {
    const blocks = buildPipelineSummaryBlocks({
      tenant_id: 'tenant-123',
      tenant_name: 'Hunhu',
      profiles_scraped: 50,
      profiles_new: 0,
      grade_distribution: {},
      top_leads: [],
      errors: ['Scraping quota exceeded'],
    });

    const context = blocks.find((b: any) => b.type === 'context');
    expect(context).toBeDefined();
  });
});

describe('buildLeadReviewBlocks', () => {
  it('produces approve/reject/linkedin buttons with tenant context', () => {
    const blocks = buildLeadReviewBlocks({
      tenant_id: 'tenant-123',
      lead_id: 'lead-123',
      full_name: 'John Doe',
      title: 'VP of Student Services',
      company: 'Metro ISD',
      fulcrum_score: 85,
      fulcrum_grade: 'A',
      fit_score: 30,
      intent_score: 50,
      first_line: 'Great work on the SEL initiative.',
      linkedin_url: 'https://linkedin.com/in/johndoe',
    });

    expect(blocks).toHaveLength(3);
    const actions = blocks.find((b: any) => b.type === 'actions') as any;
    expect(actions.elements).toHaveLength(3);
    expect(actions.elements[0].action_id).toBe('approve_lead');
    expect(JSON.parse(actions.elements[0].value)).toEqual({ tenantId: 'tenant-123', leadId: 'lead-123' });
    expect(actions.elements[1].action_id).toBe('reject_lead');
  });
});

describe('buildDealAlertBlocks', () => {
  it('renders stalled deal alerts', () => {
    const blocks = buildDealAlertBlocks([
      {
        deal_name: 'Springfield Deal',
        deal_value: 50000,
        days_stalled: 14,
        stalled_reason: 'No activity in 14 days',
        suggested_action: 'Schedule discovery call',
      },
    ]);

    expect(blocks.length).toBe(2);
    const text = (blocks[1] as any).text.text;
    expect(text).toContain('Springfield Deal');
    expect(text).toContain('$50,000');
  });
});

describe('buildStatusBlocks', () => {
  it('shows tenant stats in fields layout', () => {
    const blocks = buildStatusBlocks({
      tenant_name: 'Hunhu',
      total_leads: 250,
      pending_review: 12,
      pushed_to_crm: 85,
      grade_distribution: { 'A+': 10, A: 25 },
      stalled_deals: 3,
      last_pipeline_run: '2026-02-14T05:00:00Z',
    });

    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toHaveProperty('type', 'header');
    expect((blocks[1] as any).fields).toHaveLength(4);
  });
});

describe('buildReconciliationSummaryBlocks', () => {
  it('renders ICM reconciliation data', () => {
    const blocks = buildReconciliationSummaryBlocks({
      tenantName: 'Hunhu',
      newDeals: 5,
      invoicesMatched: 3,
      paymentsConfirmed: 2,
      pendingCommissions: 4,
      pendingCommissionValue: 12500,
      errors: [],
    });

    expect(blocks).toHaveLength(2);
    const fields = (blocks[1] as any).fields;
    expect(fields).toHaveLength(4);
  });
});

describe('buildCommissionAlertBlocks', () => {
  it('renders commission alert with dispute buttons', () => {
    const blocks = buildCommissionAlertBlocks({
      type: 'dispute_filed',
      tenantName: 'Hunhu',
      dealName: 'Metro ISD',
      dealValue: 75000,
      commissionAmount: 7500,
      details: 'Client disputes attribution',
    });

    expect(blocks.length).toBe(2);
    const actions = blocks.find((b: any) => b.type === 'actions') as any;
    expect(actions.elements).toHaveLength(3);
    expect(actions.elements[0].action_id).toBe('resolve_dispute_fulcrum');
  });

  it('skips dispute buttons for non-dispute alerts', () => {
    const blocks = buildCommissionAlertBlocks({
      type: 'new_commission',
      tenantName: 'Hunhu',
      dealName: 'Metro ISD',
      dealValue: 75000,
      commissionAmount: 7500,
      details: 'New commission calculated',
    });

    expect(blocks).toHaveLength(1);
  });
});

describe('buildSEOAuditBlocks', () => {
  it('renders SEO report with drops and cannibalization', () => {
    const blocks = buildSEOAuditBlocks({
      tenantName: 'Hunhu',
      totalKeywords: 45,
      drops: [
        { keyword: 'student SEL tools', delta: 12, severity: 'critical', position: 18 },
        { keyword: 'school counseling software', delta: 5, severity: 'high', position: 8 },
      ],
      cannibalization: [
        { keyword: 'student wellbeing', assetCount: 3 },
      ],
      briefsGenerated: 2,
      reindexSubmitted: 1,
    });

    expect(blocks.length).toBeGreaterThan(3);
    const criticalBlock = blocks.find((b: any) =>
      b.text?.text?.includes('Critical Drops')
    );
    expect(criticalBlock).toBeDefined();
  });
});

describe('buildContentAllocationBlocks', () => {
  it('renders allocation with saturation warnings', () => {
    const blocks = buildContentAllocationBlocks({
      tenantName: 'Hunhu',
      month: '2026-03',
      totalSlots: 25,
      allocations: [
        { serviceName: 'SEL Assessment', slots: 10, percentage: 40, profitabilityScore: 8.5, adjustedSlots: 10 },
        { serviceName: 'Attendance Tools', slots: 8, percentage: 32, profitabilityScore: 6.2, adjustedSlots: 5 },
      ],
      saturatedServices: ['Attendance Tools'],
    });

    expect(blocks.length).toBe(5);
    const saturatedBlock = blocks.find((b: any) =>
      b.text?.text?.includes('saturated')
    );
    expect(saturatedBlock).toBeDefined();
  });
});

describe('buildContentROIBlocks', () => {
  it('renders ROI report with champions and kill list', () => {
    const blocks = buildContentROIBlocks({
      tenantName: 'Hunhu',
      month: '2026-02',
      totalAssets: 20,
      totalVisits: 5000,
      totalPipeline: 200000,
      totalRevenue: 125000,
      revenueChampions: [
        { assetId: 'a1', title: 'SEL Guide', attributedRevenue: 45000, evs: 85, monthlyVisits: 0, pipelineContribution: 80000, costPerLead: 12, revenuePerPiece: 45000, category: 'revenue_champion' as const },
      ],
      pipelineBuilders: [],
      trafficDrivers: [],
      killList: [
        { assetId: 'a2', title: 'Old Brochure', attributedRevenue: 0, evs: 12, monthlyVisits: 5, pipelineContribution: 0, costPerLead: null, revenuePerPiece: 0, category: 'kill' as const },
      ],
    });

    expect(blocks.length).toBeGreaterThan(3);
  });
});

describe('buildPersonaSnippetBlocks', () => {
  it('renders persona snippet with deploy buttons', () => {
    const blocks = buildPersonaSnippetBlocks(
      {
        id: 'snip-1',
        assetId: 'asset-1',
        persona: 'cfo',
        hook: 'Student mental health interventions save $2.3M annually',
        body: 'By reducing chronic absenteeism through proactive SEL assessment...',
        cta: 'See the ROI calculator',
        channel: null,
        deployAt: new Date(),
        deployed: false,
        createdAt: new Date(),
      },
      'Hunhu',
    );

    expect(blocks.length).toBeGreaterThan(2);
  });
});

describe('buildCROReportBlocks', () => {
  it('renders CRO report summary', () => {
    const blocks = buildCROReportBlocks({
      tenantName: 'Hunhu',
      totalPages: 12,
      critical: [
        { pageUrl: 'https://example.com/landing', issue: 'CTA below fold', pipelineImpact: 12000 },
      ],
      warnings: [],
      abTestsQueued: 4,
      totalPipelineImpact: 12000,
    });

    expect(blocks.length).toBeGreaterThan(1);
  });
});

describe('buildSaturationAlertBlocks', () => {
  it('renders saturation alert', () => {
    const blocks = buildSaturationAlertBlocks({
      tenantName: 'Hunhu',
      saturatedServices: [
        {
          serviceName: 'Attendance Tools',
          score: 88,
          signals: ['Coverage exceeded recommended threshold'],
        },
      ],
      rebalanced: true,
    });

    expect(blocks.length).toBeGreaterThan(1);
  });
});
