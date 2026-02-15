import { prisma } from '@/lib/db';
import { getReadyDeployments, markDeployed } from '@/lib/content/persona-generator';
import { getSlackClient } from '@/lib/slack/client';
import { buildPersonaSnippetBlocks } from '@/lib/slack/blocks';
import { jobLogger } from '@/lib/logger';

const log = jobLogger('persona_deployment');

/**
 * Daily Persona Deployment Job — runs 8 AM UTC.
 *
 * Checks for persona snippets ready to deploy (deployAt <= now, not yet deployed).
 * Posts each snippet to Slack for team review / LinkedIn/email deployment.
 */
export async function runPersonaDeployment(tenantId: string): Promise<number> {
  const ready = await getReadyDeployments(tenantId);
  if (ready.length === 0) return 0;

  const slack = await getSlackClient(tenantId);
  if (!slack) return 0;

  let deployed = 0;

  for (const snippet of ready) {
    try {
      await slack.client.chat.postMessage({
        channel: slack.channelId,
        text: `Persona snippet ready: ${snippet.persona.toUpperCase()} — "${snippet.assetTitle}"`,
        blocks: buildPersonaSnippetBlocks(snippet as any, snippet.assetTitle) as never[],
      });

      await markDeployed(snippet.id);
      deployed++;
    } catch (error) {
      log.error({ err: error, snippetId: snippet.id }, 'Failed to post persona snippet');
    }
  }

  return deployed;
}

/**
 * Run persona deployment for all active tenants.
 */
export async function runPersonaDeploymentAll(): Promise<{
  totalDeployed: number;
  errors: string[];
}> {
  const tenants = await prisma.tenant.findMany({ where: { isActive: true } });
  let totalDeployed = 0;
  const errors: string[] = [];

  for (const tenant of tenants) {
    try {
      const count = await runPersonaDeployment(tenant.id);
      totalDeployed += count;
    } catch (error) {
      errors.push(`Persona deployment failed for ${tenant.name}: ${error}`);
    }
  }

  return { totalDeployed, errors };
}
