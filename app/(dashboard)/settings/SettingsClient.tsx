'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { QueryEditor, type SearchQuery } from '@/components/onboarding/QueryEditor'
import { KeywordEditor, type IntentKeyword } from '@/components/onboarding/KeywordEditor'
import { ScoringEditor, type ScoringConfig } from '@/components/onboarding/ScoringEditor'
import { IntegrationEditor } from '@/components/onboarding/IntegrationEditor'
import { ApiKeyEditor, type ApiKeySettings, type ApiKeyUpdatePayload } from '@/components/settings/ApiKeyEditor'

interface SettingsClientProps {
  tenant: {
    name: string
    productType: string
    crmType: string
    crmConfig: Record<string, string>
  }
  searchQueries: SearchQuery[]
  intentKeywords: IntentKeyword[]
  scoringConfig: ScoringConfig
  hasCrm: boolean
  hasSlack: boolean
  apiKeySettings: ApiKeySettings
}

const TABS = [
  { key: 'queries', label: 'Search Queries' },
  { key: 'keywords', label: 'Intent Keywords' },
  { key: 'scoring', label: 'Scoring' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'api-keys', label: 'API Keys' },
]

export function SettingsClient({
  tenant,
  searchQueries,
  intentKeywords,
  scoringConfig,
  hasCrm,
  hasSlack,
  apiKeySettings,
}: SettingsClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('queries')
  const [saved, setSaved] = useState(false)

  function showSaved() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleSaveSuccess() {
    showSaved()
    router.refresh()
  }

  async function handleSaveQueries(queries: SearchQuery[]) {
    const res = await fetch('/api/settings/search-queries', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries }),
    })
    if (res.ok) handleSaveSuccess()
  }

  async function handleSaveKeywords(keywords: IntentKeyword[]) {
    const res = await fetch('/api/settings/intent-keywords', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords }),
    })
    if (res.ok) handleSaveSuccess()
  }

  async function handleSaveScoring(scoring: ScoringConfig) {
    const res = await fetch('/api/settings/scoring', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scoringConfig: scoring }),
    })
    if (res.ok) handleSaveSuccess()
  }

  async function handleSaveIntegrations(data: {
    crmType?: string
    crmConfig?: Record<string, string>
    slack?: { teamId: string; botToken: string; channelId: string }
  }) {
    const responses = await Promise.all([
      data.crmType
        ? fetch('/api/settings/crm', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              crmType: data.crmType,
              crmConfig: data.crmConfig,
            }),
          })
        : Promise.resolve(new Response(null, { status: 204 })),
      data.slack
        ? fetch('/api/settings/slack', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slack: data.slack }),
          })
        : Promise.resolve(new Response(null, { status: 204 })),
    ])

    if (responses.every((response) => response.ok)) handleSaveSuccess()
  }

  async function handleSaveApiKeys(payload: ApiKeyUpdatePayload): Promise<ApiKeySettings> {
    const res = await fetch('/api/settings/api-keys', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const body = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error((body as { error?: string } | null)?.error ?? 'Failed to save API keys')
    }

    handleSaveSuccess()
    return {
      primaryLeadProvider: body.primaryLeadProvider,
      providers: body.providers,
    } satisfies ApiKeySettings
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{tenant.name}</h1>
            <p className="text-sm text-gray-400">Settings & Configuration</p>
          </div>
          {saved && (
            <span className="text-sm text-emerald-400 animate-pulse">Saved</span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 border-b border-gray-800 pb-px">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium transition-colors rounded-t-lg ${
                activeTab === tab.key
                  ? 'text-brand-cyan border-b-2 border-brand-cyan'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'queries' && (
          <QueryEditor
            initialQueries={searchQueries}
            onSave={handleSaveQueries}
            saveLabel="Save Changes"
          />
        )}

        {activeTab === 'keywords' && (
          <KeywordEditor
            initialKeywords={intentKeywords}
            onSave={handleSaveKeywords}
            saveLabel="Save Changes"
          />
        )}

        {activeTab === 'scoring' && (
          <ScoringEditor
            initialScoring={scoringConfig}
            onSave={handleSaveScoring}
            saveLabel="Save Changes"
          />
        )}

        {activeTab === 'integrations' && (
          <IntegrationEditor
            currentCrmType={tenant.crmType}
            currentCrmConfig={tenant.crmConfig}
            hasCrm={hasCrm}
            hasSlack={hasSlack}
            onSave={handleSaveIntegrations}
            saveLabel="Save Changes"
          />
        )}

        {activeTab === 'api-keys' && (
          <ApiKeyEditor
            initialSettings={apiKeySettings}
            onSave={handleSaveApiKeys}
            saveLabel="Save Changes"
          />
        )}
      </div>
    </div>
  )
}
