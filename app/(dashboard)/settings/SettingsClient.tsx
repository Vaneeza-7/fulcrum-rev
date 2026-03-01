'use client'

import { useState } from 'react'
import { QueryEditor, type SearchQuery } from '@/components/onboarding/QueryEditor'
import { KeywordEditor, type IntentKeyword } from '@/components/onboarding/KeywordEditor'
import { ScoringEditor, type ScoringConfig } from '@/components/onboarding/ScoringEditor'
import { IntegrationEditor } from '@/components/onboarding/IntegrationEditor'

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
  hasSlack: boolean
}

const TABS = [
  { key: 'queries', label: 'Search Queries' },
  { key: 'keywords', label: 'Intent Keywords' },
  { key: 'scoring', label: 'Scoring' },
  { key: 'integrations', label: 'Integrations' },
]

export function SettingsClient({
  tenant,
  searchQueries,
  intentKeywords,
  scoringConfig,
  hasSlack,
}: SettingsClientProps) {
  const [activeTab, setActiveTab] = useState('queries')
  const [saved, setSaved] = useState(false)

  function showSaved() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleSaveQueries(queries: SearchQuery[]) {
    const res = await fetch('/api/onboarding/save-queries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries }),
    })
    if (res.ok) showSaved()
  }

  async function handleSaveKeywords(keywords: IntentKeyword[]) {
    const res = await fetch('/api/onboarding/save-keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords }),
    })
    if (res.ok) showSaved()
  }

  async function handleSaveScoring(scoring: ScoringConfig) {
    const res = await fetch('/api/onboarding/save-scoring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scoring),
    })
    if (res.ok) showSaved()
  }

  async function handleSaveIntegrations(data: {
    crmType?: string
    crmConfig?: Record<string, string>
    slack?: { teamId: string; botToken: string; channelId: string }
  }) {
    const res = await fetch('/api/onboarding/save-integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) showSaved()
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
            hasSlack={hasSlack}
            onSave={handleSaveIntegrations}
            saveLabel="Save Changes"
          />
        )}
      </div>
    </div>
  )
}
