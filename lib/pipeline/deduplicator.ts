import { prisma } from '@/lib/db';
import { LinkedInProfile } from './types';

/**
 * Filter out profiles that already exist in the leads table for this tenant.
 * Uses the unique constraint on (tenant_id, linkedin_url).
 */
export async function deduplicateProfiles(
  tenantId: string,
  profiles: LinkedInProfile[]
): Promise<{ newProfiles: LinkedInProfile[]; duplicateCount: number }> {
  if (profiles.length === 0) {
    return { newProfiles: [], duplicateCount: 0 };
  }

  const urls = profiles.map((p) => p.linkedin_url).filter(Boolean);

  // Batch check existing URLs
  const existingLeads = await prisma.lead.findMany({
    where: {
      tenantId,
      linkedinUrl: { in: urls },
    },
    select: { linkedinUrl: true },
  });

  const existingUrls = new Set(existingLeads.map((l) => l.linkedinUrl));

  const newProfiles = profiles.filter(
    (p) => p.linkedin_url && !existingUrls.has(p.linkedin_url)
  );

  return {
    newProfiles,
    duplicateCount: profiles.length - newProfiles.length,
  };
}
