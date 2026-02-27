import type { ROIAttributionResult, ROIAttributionLabel, ICRMAdapter } from './attribution-types'

/**
 * Given an array of lead IDs and an optional CRM adapter,
 * classify the overall ROI attribution label for a set of leads.
 *
 * Rules:
 *   - If crmAdapter is null/undefined → always ESTIMATED
 *   - If every lead has a non-null deal value from CRM → VERIFIED
 *   - If some leads have CRM data and some do not → MIXED
 *   - If no leads have CRM data → ESTIMATED
 */
export async function getROIAttribution(
  leadIds: string[],
  crmAdapter?: ICRMAdapter | null
): Promise<ROIAttributionResult> {
  if (!crmAdapter || leadIds.length === 0) {
    return buildResult('ESTIMATED', 0, leadIds.length)
  }

  let verifiedCount = 0

  await Promise.all(
    leadIds.map(async (id) => {
      try {
        const value = await crmAdapter.getLeadDealValue(id)
        if (value !== null && value !== undefined) {
          verifiedCount++
        }
      } catch {
        // CRM lookup failed — treat as unverified
      }
    })
  )

  let label: ROIAttributionLabel
  if (verifiedCount === 0) {
    label = 'ESTIMATED'
  } else if (verifiedCount === leadIds.length) {
    label = 'VERIFIED'
  } else {
    label = 'MIXED'
  }

  return buildResult(label, verifiedCount, leadIds.length)
}

function buildResult(
  label: ROIAttributionLabel,
  verifiedLineItems: number,
  totalLineItems: number
): ROIAttributionResult {
  const tooltipMap: Record<ROIAttributionLabel, string> = {
    ESTIMATED: 'This figure is based on Fulcrum AI projection. Connect your CRM to verify.',
    VERIFIED: 'This figure is pulled live from your connected CRM.',
    MIXED: 'Some line items are CRM-verified; others are AI-estimated.',
  }
  return {
    label,
    verifiedLineItems,
    totalLineItems,
    tooltipText: tooltipMap[label],
  }
}
