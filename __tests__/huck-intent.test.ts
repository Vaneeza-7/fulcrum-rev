import { describe, it, expect } from 'vitest';
import type { ClassifiedIntent, HuckIntent } from '@/lib/huck/types';

// ============================================================================
// INTENT CLASSIFICATION TESTS (unit tests — no Claude API calls)
// ============================================================================

// Test the classification output schema validation
function validateClassification(result: ClassifiedIntent): boolean {
  const validIntents: HuckIntent[] = [
    'lead_query', 'lead_detail', 'pipeline_control', 'deal_health',
    'system_status', 'config_change', 'help', 'unknown',
  ];

  return (
    validIntents.includes(result.intent) &&
    typeof result.confidence === 'number' &&
    result.confidence >= 0 &&
    result.confidence <= 1 &&
    typeof result.entities === 'object'
  );
}

describe('intent classification schema', () => {
  it('validates a lead_query classification', () => {
    const result: ClassifiedIntent = {
      intent: 'lead_query',
      entities: { grade: 'A+' },
      confidence: 0.95,
    };
    expect(validateClassification(result)).toBe(true);
  });

  it('validates a lead_detail classification with entity', () => {
    const result: ClassifiedIntent = {
      intent: 'lead_detail',
      entities: { leadName: 'Sarah Chen' },
      confidence: 0.9,
    };
    expect(validateClassification(result)).toBe(true);
    expect(result.entities.leadName).toBe('Sarah Chen');
  });

  it('validates a deal_health classification', () => {
    const result: ClassifiedIntent = {
      intent: 'deal_health',
      entities: { dealName: 'Johnson Corp' },
      confidence: 0.85,
    };
    expect(validateClassification(result)).toBe(true);
  });

  it('validates a pipeline_control classification', () => {
    const result: ClassifiedIntent = {
      intent: 'pipeline_control',
      entities: {},
      confidence: 0.92,
    };
    expect(validateClassification(result)).toBe(true);
  });

  it('validates a system_status classification', () => {
    const result: ClassifiedIntent = {
      intent: 'system_status',
      entities: {},
      confidence: 0.88,
    };
    expect(validateClassification(result)).toBe(true);
  });

  it('validates a help classification', () => {
    const result: ClassifiedIntent = {
      intent: 'help',
      entities: {},
      confidence: 0.99,
    };
    expect(validateClassification(result)).toBe(true);
  });

  it('validates an unknown classification', () => {
    const result: ClassifiedIntent = {
      intent: 'unknown',
      entities: {},
      confidence: 0.3,
    };
    expect(validateClassification(result)).toBe(true);
  });

  it('rejects invalid intent types', () => {
    const result = {
      intent: 'invalid_type' as HuckIntent,
      entities: {},
      confidence: 0.5,
    };
    expect(validateClassification(result)).toBe(false);
  });

  it('rejects confidence out of range', () => {
    const result: ClassifiedIntent = {
      intent: 'lead_query',
      entities: {},
      confidence: 1.5,
    };
    expect(validateClassification(result)).toBe(false);
  });

  it('handles all entity types', () => {
    const result: ClassifiedIntent = {
      intent: 'lead_query',
      entities: {
        leadName: 'John Doe',
        grade: 'A',
        tenantName: 'Hunhu',
        dealName: 'Big Deal',
        timeRange: 'this week',
      },
      confidence: 0.7,
    };
    expect(validateClassification(result)).toBe(true);
    expect(result.entities.leadName).toBe('John Doe');
    expect(result.entities.grade).toBe('A');
    expect(result.entities.tenantName).toBe('Hunhu');
    expect(result.entities.dealName).toBe('Big Deal');
    expect(result.entities.timeRange).toBe('this week');
  });
});

describe('intent type coverage', () => {
  const intentExamples: Record<HuckIntent, string[]> = {
    lead_query: ['show me A+ leads', 'how many leads today?', 'any new leads?'],
    lead_detail: ['tell me about Sarah Chen', 'what is the score on Acme Corp?'],
    pipeline_control: ['run the pipeline', 'start scraping', 'when was the last run?'],
    deal_health: ['any stalled deals?', "how's the Johnson deal?", 'deal alerts'],
    system_status: ['is everything working?', 'check CRM', 'system status'],
    config_change: ['change scoring weight', 'update keywords'],
    content_query: ['what content should we create?', 'EVS rankings', 'saturated topics?'],
    seo_status: ['any ranking drops?', 'SEO health', 'cannibalization?'],
    cro_status: ['website conversions?', 'pricing page performance?'],
    content_roi: ['which content drives revenue?', 'kill list', 'revenue champions'],
    help: ['what can you do?', 'help', 'commands'],
    unknown: ['lorem ipsum', 'what is the meaning of life?'],
  };

  for (const [intent, examples] of Object.entries(intentExamples)) {
    it(`has example messages for ${intent}`, () => {
      expect(examples.length).toBeGreaterThan(0);
    });
  }

  it('all 12 intent types are represented', () => {
    expect(Object.keys(intentExamples)).toHaveLength(12);
  });
});
