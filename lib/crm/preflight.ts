import type { Lead, Tenant } from '@prisma/client'
import type { CRMAuthConfig, CRMLeadData } from './types'
import { decryptCrmConfig } from '@/lib/settings/crm'

export type CrmPushFailureCode =
  | 'crm_not_configured'
  | 'crm_config_unreadable'
  | 'crm_credentials_incomplete'
  | 'missing_full_name'
  | 'missing_linkedin_url'
  | 'missing_company'
  | 'duplicate_detected'
  | 'validation_failed'
  | 'auth_failed'
  | 'transient_failed'

export interface CrmPreflightResult {
  ok: boolean
  connector: string | null
  errorCode?: CrmPushFailureCode
  message?: string
  crmConfig?: CRMAuthConfig
}

export interface HumanizedCrmError {
  errorCode: CrmPushFailureCode
  message: string
  duplicate: boolean
}

function hasValues(config: CRMAuthConfig, keys: string[]) {
  return keys.every((key) => typeof config[key] === 'string' && config[key]!.trim().length > 0)
}

function splitLeadName(fullName: string) {
  const trimmed = fullName.trim()
  const parts = trimmed.split(/\s+/).filter(Boolean)
  const firstName = parts.slice(0, -1).join(' ') || parts[0] || 'Unknown'
  const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0] || 'Unknown'
  return { firstName, lastName }
}

export function buildCrmLeadData(
  lead: Pick<Lead, 'fullName' | 'company' | 'title' | 'linkedinUrl' | 'fulcrumScore' | 'fulcrumGrade' | 'fitScore' | 'intentScore' | 'firstLine'>,
  tenantName: string,
): CRMLeadData {
  const { firstName, lastName } = splitLeadName(lead.fullName)

  return {
    first_name: firstName,
    last_name: lastName,
    company: lead.company ?? '',
    title: lead.title ?? '',
    linkedin_url: lead.linkedinUrl,
    fulcrum_score: Number(lead.fulcrumScore),
    fulcrum_grade: lead.fulcrumGrade ?? '',
    fit_score: Number(lead.fitScore),
    intent_score: Number(lead.intentScore),
    first_line: lead.firstLine ?? '',
    source: `Fulcrum - ${tenantName}`,
  }
}

function validateConnectorCredentials(crmType: string, crmConfig: CRMAuthConfig): CrmPreflightResult | null {
  switch (crmType) {
    case 'hubspot': {
      const hasPrivateApp = typeof crmConfig.api_key === 'string' && crmConfig.api_key.trim().length > 0
      const hasOauth = hasValues(crmConfig, ['client_id', 'client_secret', 'refresh_token'])
      if (hasPrivateApp || hasOauth) return null
      return {
        ok: false,
        connector: 'hubspot',
        errorCode: 'crm_credentials_incomplete',
        message: 'HubSpot credentials are incomplete.',
      }
    }
    case 'zoho': {
      if (hasValues(crmConfig, ['client_id', 'client_secret', 'refresh_token'])) return null
      return {
        ok: false,
        connector: 'zoho',
        errorCode: 'crm_credentials_incomplete',
        message: 'Zoho credentials are incomplete.',
      }
    }
    case 'salesforce': {
      if (hasValues(crmConfig, ['client_id', 'client_secret', 'refresh_token'])) return null
      return {
        ok: false,
        connector: 'salesforce',
        errorCode: 'crm_credentials_incomplete',
        message: 'Salesforce credentials are incomplete.',
      }
    }
    default:
      return {
        ok: false,
        connector: crmType,
        errorCode: 'crm_not_configured',
        message: 'CRM connector is not supported.',
      }
  }
}

function validateLeadData(crmType: string, lead: Pick<Lead, 'fullName' | 'company' | 'linkedinUrl'>): CrmPreflightResult | null {
  if (!lead.fullName.trim()) {
    return {
      ok: false,
      connector: crmType,
      errorCode: 'missing_full_name',
      message: 'Lead is missing a name.',
    }
  }

  if (!lead.linkedinUrl.trim()) {
    return {
      ok: false,
      connector: crmType,
      errorCode: 'missing_linkedin_url',
      message: 'Lead is missing a LinkedIn URL.',
    }
  }

  if ((crmType === 'zoho' || crmType === 'salesforce') && !lead.company?.trim()) {
    return {
      ok: false,
      connector: crmType,
      errorCode: 'missing_company',
      message: `Lead is missing a company name required by ${crmType === 'zoho' ? 'Zoho' : 'Salesforce'}.`,
    }
  }

  return null
}

export function runCrmPreflight(
  tenant: Pick<Tenant, 'crmType' | 'crmConfig'>,
  lead: Pick<Lead, 'fullName' | 'company' | 'linkedinUrl'>,
): CrmPreflightResult {
  if (!tenant.crmType) {
    return {
      ok: false,
      connector: null,
      errorCode: 'crm_not_configured',
      message: 'CRM is not configured for this tenant.',
    }
  }

  const crmConfig = decryptCrmConfig(tenant.crmConfig)
  if (!crmConfig) {
    return {
      ok: false,
      connector: tenant.crmType,
      errorCode: 'crm_config_unreadable',
      message: 'CRM configuration is missing or unreadable.',
    }
  }

  const credentialsError = validateConnectorCredentials(tenant.crmType, crmConfig)
  if (credentialsError) return credentialsError

  const leadError = validateLeadData(tenant.crmType, lead)
  if (leadError) return leadError

  return {
    ok: true,
    connector: tenant.crmType,
    crmConfig,
  }
}

export function humanizeCrmPushError(error: unknown): HumanizedCrmError {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()

  if (
    normalized.includes('duplicate') ||
    normalized.includes('already exists') ||
    normalized.includes('conflict') ||
    normalized.includes('409')
  ) {
    return {
      errorCode: 'duplicate_detected',
      message: 'Duplicate detected in the CRM.',
      duplicate: true,
    }
  }

  if (
    normalized.includes('401') ||
    normalized.includes('403') ||
    normalized.includes('unauthorized') ||
    normalized.includes('auth') ||
    normalized.includes('refresh token')
  ) {
    return {
      errorCode: 'auth_failed',
      message: 'CRM authentication failed.',
      duplicate: false,
    }
  }

  if (
    normalized.includes('required') ||
    normalized.includes('validation') ||
    normalized.includes('invalid') ||
    normalized.includes('missing') ||
    normalized.includes('400')
  ) {
    if (normalized.includes('owner')) {
      return {
        errorCode: 'validation_failed',
        message: 'Missing owner mapping in the CRM configuration.',
        duplicate: false,
      }
    }

    if (normalized.includes('company')) {
      return {
        errorCode: 'validation_failed',
        message: 'Lead is missing a required company field for the CRM.',
        duplicate: false,
      }
    }

    return {
      errorCode: 'validation_failed',
      message: 'CRM rejected the lead because a required field or mapping is missing.',
      duplicate: false,
    }
  }

  return {
    errorCode: 'transient_failed',
    message: 'CRM push failed because of a temporary connector error.',
    duplicate: false,
  }
}
