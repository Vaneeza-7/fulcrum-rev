import { prisma } from '@/lib/db';
import { askClaudeJson } from '@/lib/ai/claude';
import { ABTestHypothesis } from './types';

/**
 * A/B Test Queue — generates, prioritizes, and manages conversion experiments.
 */

const AB_TEST_GENERATION_PROMPT = `You are a conversion optimization expert. Given CRO audit findings,
generate A/B test hypotheses sorted by expected pipeline impact.

For each test, return a JSON array:
[{
  "pageUrl": string,
  "hypothesis": string (clear, testable statement),
  "controlDesc": string (current state),
  "variantDesc": string (proposed change),
  "expectedLift": number (percentage, e.g. 3.2 = 3.2% lift),
  "expectedPipelineImpact": number ($/month),
  "priority": "low" | "medium" | "high",
  "duration": string (e.g. "2 weeks"),
  "minConversions": number (statistical significance threshold)
}]

Only generate tests where the expected lift is >1% and pipeline impact >$1,000/month.`;

/**
 * Generate A/B test hypotheses from CRO audit findings.
 */
export async function generateTestHypotheses(
  tenantId: string,
  croAuditId: string
): Promise<ABTestHypothesis[]> {
  const audit = await prisma.cROAudit.findUniqueOrThrow({ where: { id: croAuditId } });

  const prompt = `Page: ${audit.pageUrl} (type: ${audit.pageType})
Metrics: ${JSON.stringify(audit.metrics)}
Issues found: ${JSON.stringify(audit.issues)}
Recommendations: ${JSON.stringify(audit.recommendations)}
Estimated pipeline impact: $${Number(audit.estimatedPipelineImpact ?? 0).toLocaleString()}/month`;

  const hypotheses = await askClaudeJson<ABTestHypothesis[]>(
    AB_TEST_GENERATION_PROMPT,
    prompt
  );

  // Store as ABTest records
  for (const hyp of hypotheses) {
    await prisma.aBTest.create({
      data: {
        tenantId,
        pageUrl: hyp.pageUrl,
        hypothesis: hyp.hypothesis,
        controlDesc: hyp.controlDesc,
        variantDesc: hyp.variantDesc,
        status: 'queued',
        priority: hyp.priority,
        expectedLift: hyp.expectedLift,
      },
    });
  }

  return hypotheses;
}

/**
 * Get prioritized test queue for a tenant.
 */
export async function getTestQueue(tenantId: string): Promise<{
  queued: number;
  running: number;
  completed: number;
  tests: {
    id: string;
    pageUrl: string;
    hypothesis: string;
    status: string;
    priority: string;
    expectedLift: number | null;
  }[];
}> {
  const tests = await prisma.aBTest.findMany({
    where: { tenantId },
    orderBy: [
      { priority: 'desc' },
      { expectedLift: 'desc' },
    ],
  });

  return {
    queued: tests.filter((t) => t.status === 'queued').length,
    running: tests.filter((t) => t.status === 'running').length,
    completed: tests.filter((t) => t.status === 'completed').length,
    tests: tests.map((t) => ({
      id: t.id,
      pageUrl: t.pageUrl,
      hypothesis: t.hypothesis,
      status: t.status,
      priority: t.priority,
      expectedLift: t.expectedLift ? Number(t.expectedLift) : null,
    })),
  };
}

/**
 * Complete a test and record results.
 */
export async function completeTest(
  testId: string,
  results: { actualLift: number; winner: 'control' | 'variant'; details: string }
): Promise<void> {
  await prisma.aBTest.update({
    where: { id: testId },
    data: {
      status: 'completed',
      completedAt: new Date(),
      actualLift: results.actualLift,
      resultsJson: results,
    },
  });
}
