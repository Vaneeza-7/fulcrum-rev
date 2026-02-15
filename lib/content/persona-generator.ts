import { prisma } from '@/lib/db';
import { askClaudeJson } from '@/lib/ai/claude';
import { PERSONA_SNIPPET_PROMPT } from '@/lib/ai/prompts';
import { PersonaSnippetResult } from './types';

/**
 * Persona Snippet Generator.
 * For every content asset, generates 3 stakeholder-specific distribution snippets:
 * - CFO: ROI, risk mitigation, budget justification
 * - Director: implementation ease, adoption metrics, minimal disruption
 * - End-User: pain relief, workflow simplification, time savings
 */

/** Staggered deployment schedule (offsets from asset deployment). */
const DEPLOY_SCHEDULE: Record<string, { dayOffset: number; hour: number; minute: number }> = {
  cfo: { dayOffset: 0, hour: 9, minute: 0 }, // Tuesday 9 AM (if deployed Monday)
  director: { dayOffset: 2, hour: 14, minute: 0 }, // Thursday 2 PM
  end_user: { dayOffset: 4, hour: 10, minute: 0 }, // Friday 10 AM (next week if deployed late)
};

/**
 * Generate all 3 persona snippets for a content asset.
 */
export async function generatePersonaSnippets(assetId: string): Promise<PersonaSnippetResult[]> {
  const asset = await prisma.contentAsset.findUniqueOrThrow({
    where: { id: assetId },
    include: { service: true },
  });

  const serviceContext = asset.service
    ? `Service: ${asset.service.name} (deal size: $${Number(asset.service.dealSize).toLocaleString()}, close rate: ${(Number(asset.service.closeRate) * 100).toFixed(1)}%)`
    : '';

  const prompt = `Content Asset: "${asset.title}"
URL: ${asset.url ?? 'N/A'}
EVS Score: ${Number(asset.evs)}
${serviceContext}

Generate 3 stakeholder distribution snippets for this asset.`;

  const snippets = await askClaudeJson<PersonaSnippetResult[]>(
    PERSONA_SNIPPET_PROMPT,
    prompt
  );

  // Calculate staggered deploy times
  const baseDate = new Date();
  // Start from next Tuesday if today isn't Monday/Tuesday
  const dayOfWeek = baseDate.getDay();
  const daysUntilTuesday = dayOfWeek <= 2 ? 2 - dayOfWeek : 9 - dayOfWeek;
  baseDate.setDate(baseDate.getDate() + daysUntilTuesday);

  // Store snippets in DB with deployment schedule
  for (const snippet of snippets) {
    const schedule = DEPLOY_SCHEDULE[snippet.persona];
    const deployAt = new Date(baseDate);
    deployAt.setDate(deployAt.getDate() + schedule.dayOffset);
    deployAt.setHours(schedule.hour, schedule.minute, 0, 0);

    await prisma.personaSnippet.create({
      data: {
        assetId,
        persona: snippet.persona,
        hook: snippet.hook,
        body: snippet.body,
        cta: snippet.cta,
        deployAt,
        deployed: false,
      },
    });
  }

  return snippets;
}

/**
 * Get snippets that are ready for deployment (deployAt <= now, not yet deployed).
 */
export async function getReadyDeployments(tenantId: string): Promise<{
  id: string;
  persona: string;
  hook: string;
  body: string;
  cta: string;
  assetTitle: string;
}[]> {
  const snippets = await prisma.personaSnippet.findMany({
    where: {
      deployed: false,
      deployAt: { lte: new Date() },
      asset: { tenantId },
    },
    include: {
      asset: { select: { title: true } },
    },
    orderBy: { deployAt: 'asc' },
  });

  return snippets.map((s) => ({
    id: s.id,
    persona: s.persona,
    hook: s.hook,
    body: s.body,
    cta: s.cta,
    assetTitle: s.asset.title,
  }));
}

/**
 * Mark a snippet as deployed.
 */
export async function markDeployed(snippetId: string): Promise<void> {
  await prisma.personaSnippet.update({
    where: { id: snippetId },
    data: { deployed: true },
  });
}
