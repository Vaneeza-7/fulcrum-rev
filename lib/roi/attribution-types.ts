export type ROIAttributionLabel = 'ESTIMATED' | 'VERIFIED' | 'MIXED'

export interface ROIAttributionResult {
  label: ROIAttributionLabel
  verifiedLineItems: number
  totalLineItems: number
  tooltipText: string
}

export interface ICRMAdapter {
  getLeadDealValue(leadId: string): Promise<number | null>
  getLeadStage(leadId: string): Promise<string | null>
}
