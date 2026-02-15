import { describe, it, expect } from 'vitest';
import { formatLeadsForContext, formatDealsForContext, formatStatsForContext, formatHealthForContext } from '@/lib/huck/formatters';
import type { PipelineStats } from '@/lib/huck/types';

describe('formatLeadsForContext', () => {
  it('formats an empty array', () => {
    expect(formatLeadsForContext([])).toBe('No leads found.');
  });

  it('formats a single lead', () => {
    const leads = [{
      id: '1',
      tenantId: 't1',
      linkedinUrl: 'https://linkedin.com/in/test',
      fullName: 'Sarah Chen',
      title: 'VP of Sales',
      company: 'Acme Corp',
      location: 'SF',
      profileData: {},
      enrichmentData: {},
      enrichedAt: new Date(),
      fitScore: { toNumber: () => 30 } as any,
      intentScore: { toNumber: () => 45 } as any,
      fulcrumScore: { toNumber: () => 82 } as any,
      fulcrumGrade: 'A',
      scoreBreakdown: {},
      scoredAt: new Date(),
      firstLine: 'Great to see Acme growing!',
      firstLineGeneratedAt: new Date(),
      lastDataCheckAt: null,
      dataFreshnessScore: 100,
      isStale: false,
      status: 'pending_review',
      rejectionReason: null,
      crmLeadId: null,
      pushedToCrmAt: null,
      discoveredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }] as any;

    const result = formatLeadsForContext(leads);
    expect(result).toContain('Sarah Chen');
    expect(result).toContain('VP of Sales');
    expect(result).toContain('Acme Corp');
    expect(result).toContain('Leads (1)');
  });
});

describe('formatDealsForContext', () => {
  it('formats an empty array', () => {
    expect(formatDealsForContext([])).toBe('No deal diagnostics found.');
  });

  it('formats a stalled deal', () => {
    const deals = [{
      id: '1',
      tenantId: 't1',
      dealId: 'deal-1',
      dealName: 'Big Enterprise Deal',
      dealValue: { toNumber: () => 50000 } as any,
      dealStage: 'Negotiation',
      lastActivityDate: null,
      daysSinceActivity: 14,
      stageChangeDate: null,
      daysInStage: 35,
      emailSentCount: 5,
      emailResponseCount: 0,
      engagementScore: null,
      isStalled: true,
      stalledReason: 'No activity in 14 days',
      stalledDetectedAt: new Date(),
      taskCreated: false,
      taskId: null,
      alertSent: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }] as any;

    const result = formatDealsForContext(deals);
    expect(result).toContain('Big Enterprise Deal');
    expect(result).toContain('Stalled: YES');
    expect(result).toContain('Deal Diagnostics (1)');
  });
});

describe('formatStatsForContext', () => {
  it('formats pipeline stats', () => {
    const stats: PipelineStats = {
      totalLeads: 150,
      pendingReview: 25,
      pushedToCrm: 80,
      gradeDistribution: { 'A+': 5, 'A': 15, 'B': 30, 'C': 20, 'D': 10 },
      stalledDeals: 3,
      lastPipelineRun: '2026-02-14T05:00:00Z',
    };

    const result = formatStatsForContext(stats);
    expect(result).toContain('Total leads: 150');
    expect(result).toContain('Pending review: 25');
    expect(result).toContain('Pushed to CRM: 80');
    expect(result).toContain('Stalled deals: 3');
    expect(result).toContain('A+: 5');
    expect(result).toContain('2026-02-14');
  });

  it('handles empty grade distribution', () => {
    const stats: PipelineStats = {
      totalLeads: 0,
      pendingReview: 0,
      pushedToCrm: 0,
      gradeDistribution: {},
      stalledDeals: 0,
      lastPipelineRun: null,
    };

    const result = formatStatsForContext(stats);
    expect(result).toContain('None');
    expect(result).toContain('Never');
  });
});

describe('formatHealthForContext', () => {
  it('formats an empty array', () => {
    expect(formatHealthForContext([])).toBe('No recent health checks.');
  });

  it('formats health check results', () => {
    const checks = [
      {
        id: '1',
        tenantId: 't1',
        checkType: 'crm_connectivity',
        status: 'healthy',
        detailsJson: {},
        checkedAt: new Date('2026-02-14T10:00:00Z'),
      },
      {
        id: '2',
        tenantId: 't1',
        checkType: 'data_freshness',
        status: 'degraded',
        detailsJson: {},
        checkedAt: new Date('2026-02-14T10:00:00Z'),
      },
    ] as any;

    const result = formatHealthForContext(checks);
    expect(result).toContain('crm_connectivity: healthy');
    expect(result).toContain('data_freshness: degraded');
    expect(result).toContain('System Health:');
  });
});
