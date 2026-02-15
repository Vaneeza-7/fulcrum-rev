import { prisma } from '@/lib/db';
import { generatePersonaSnippets } from './persona-generator';

/**
 * Content Deployment Manager.
 * Handles the lifecycle of content assets: deploy → schedule snippets → track.
 */

/**
 * Deploy a content asset and schedule persona snippet generation.
 */
export async function deployAsset(assetId: string): Promise<void> {
  const asset = await prisma.contentAsset.findUniqueOrThrow({
    where: { id: assetId },
  });

  if (asset.status !== 'draft') {
    throw new Error(`Asset "${asset.title}" is already ${asset.status}`);
  }

  // Mark as deployed
  await prisma.contentAsset.update({
    where: { id: assetId },
    data: {
      status: 'deployed',
      deployedAt: new Date(),
    },
  });

  // Generate persona snippets with staggered deployment
  await generatePersonaSnippets(assetId);
}

/**
 * Kill an underperforming asset (EVS dropped below threshold).
 */
export async function killAsset(assetId: string): Promise<void> {
  await prisma.contentAsset.update({
    where: { id: assetId },
    data: { status: 'killed' },
  });

  // Cancel any pending snippet deployments
  await prisma.personaSnippet.updateMany({
    where: { assetId, deployed: false },
    data: { deployed: true }, // Mark as "deployed" to prevent future processing
  });
}

/**
 * Mark an asset for refresh (triggered by SEO audit).
 */
export async function markForRefresh(assetId: string): Promise<void> {
  await prisma.contentAsset.update({
    where: { id: assetId },
    data: { status: 'refreshing' },
  });
}

/**
 * Complete a refresh and re-deploy the asset.
 */
export async function completeRefresh(assetId: string): Promise<void> {
  await prisma.contentAsset.update({
    where: { id: assetId },
    data: {
      status: 'deployed',
      deployedAt: new Date(), // Update deploy date to trigger fresh snippet cycle
    },
  });

  // Generate new persona snippets for the refreshed content
  await generatePersonaSnippets(assetId);
}

/**
 * Get deployment statistics for a tenant.
 */
export async function getDeploymentStats(tenantId: string): Promise<{
  total: number;
  deployed: number;
  draft: number;
  refreshing: number;
  killed: number;
  pendingSnippets: number;
}> {
  const [total, deployed, draft, refreshing, killed, pendingSnippets] = await Promise.all([
    prisma.contentAsset.count({ where: { tenantId } }),
    prisma.contentAsset.count({ where: { tenantId, status: 'deployed' } }),
    prisma.contentAsset.count({ where: { tenantId, status: 'draft' } }),
    prisma.contentAsset.count({ where: { tenantId, status: 'refreshing' } }),
    prisma.contentAsset.count({ where: { tenantId, status: 'killed' } }),
    prisma.personaSnippet.count({
      where: { deployed: false, asset: { tenantId } },
    }),
  ]);

  return { total, deployed, draft, refreshing, killed, pendingSnippets };
}
