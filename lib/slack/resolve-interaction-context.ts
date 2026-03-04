import { prisma } from '@/lib/db'

export interface ParsedSlackActionValue {
  tenantId?: string
  leadId?: string
  brandSuggestionId?: string
  grades?: string[]
  reason?: string
  rejectReason?: string
  alertId?: string
  resourceId?: string
  resourceName?: string
  raw?: string
  [key: string]: unknown
}

export function parseSlackActionValue(value: string | undefined | null): ParsedSlackActionValue {
  if (!value) return {}

  try {
    const parsed = JSON.parse(value) as ParsedSlackActionValue
    return parsed ?? {}
  } catch {
    return { raw: value, leadId: value }
  }
}

export async function resolveSlackInteractionTenantId(
  payload: { team?: { id?: string | null } | null },
  parsedValue: ParsedSlackActionValue,
): Promise<string | null> {
  if (parsedValue.tenantId) {
    return parsedValue.tenantId
  }

  const teamId = payload.team?.id ?? null
  if (!teamId) return null

  const config = await prisma.tenantSlackConfig.findFirst({
    where: { teamId },
    select: { tenantId: true },
  })

  return config?.tenantId ?? null
}

export function resolveSlackInteractionLeadId(parsedValue: ParsedSlackActionValue): string | null {
  return parsedValue.leadId ?? parsedValue.raw ?? null
}
