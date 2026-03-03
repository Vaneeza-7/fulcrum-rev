'use client'

import { useMemo, useState } from 'react'

export interface ApiKeySettings {
  primaryLeadProvider: 'instantly' | 'apify'
  providers: {
    instantly: {
      usingTenantKey: boolean
      workspaceId: string | null
      hasPlatformFallback: boolean
    }
    apify: {
      usingTenantKey: boolean
      hasPlatformFallback: boolean
    }
    anthropic: {
      usingTenantKey: boolean
      hasPlatformFallback: boolean
    }
    perplexity: {
      usingTenantKey: boolean
      hasPlatformFallback: boolean
    }
  }
}

export interface ApiKeyUpdatePayload {
  primaryLeadProvider: 'instantly' | 'apify'
  instantly?: {
    apiKey?: string
    workspaceId?: string
  }
  apifyApiToken?: string | null
  anthropicApiKey?: string | null
  perplexityApiKey?: string | null
  clear: Array<'instantly' | 'apify' | 'anthropic' | 'perplexity'>
}

interface ApiKeyEditorProps {
  initialSettings: ApiKeySettings
  onSave: (payload: ApiKeyUpdatePayload) => Promise<ApiKeySettings>
  saveLabel?: string
}

function ProviderStatus({
  label,
  usingTenantKey,
  hasPlatformFallback,
}: {
  label: string
  usingTenantKey: boolean
  hasPlatformFallback: boolean
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-white">{label}</h3>
          <p className="mt-1 text-xs text-gray-500">
            {usingTenantKey ? 'Tenant credential stored' : 'Using platform credential'}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[11px] font-medium ${
            usingTenantKey
              ? 'bg-emerald-500/10 text-emerald-300'
              : 'bg-gray-800 text-gray-300'
          }`}
        >
          {usingTenantKey ? 'Tenant Key' : 'Platform Key'}
        </span>
      </div>
      <p className="mt-3 text-xs text-gray-400">
        Platform fallback: {hasPlatformFallback ? 'available' : 'missing'}
      </p>
    </div>
  )
}

export function ApiKeyEditor({
  initialSettings,
  onSave,
  saveLabel = 'Save Changes',
}: ApiKeyEditorProps) {
  const [settings, setSettings] = useState(initialSettings)
  const [primaryLeadProvider, setPrimaryLeadProvider] = useState(initialSettings.primaryLeadProvider)
  const [instantlyApiKey, setInstantlyApiKey] = useState('')
  const [instantlyWorkspaceId, setInstantlyWorkspaceId] = useState(initialSettings.providers.instantly.workspaceId ?? '')
  const [apifyApiToken, setApifyApiToken] = useState('')
  const [anthropicApiKey, setAnthropicApiKey] = useState('')
  const [perplexityApiKey, setPerplexityApiKey] = useState('')
  const [clearInstantly, setClearInstantly] = useState(false)
  const [clearApify, setClearApify] = useState(false)
  const [clearAnthropic, setClearAnthropic] = useState(false)
  const [clearPerplexity, setClearPerplexity] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clear = useMemo(() => {
    return [
      ...(clearInstantly ? ['instantly' as const] : []),
      ...(clearApify ? ['apify' as const] : []),
      ...(clearAnthropic ? ['anthropic' as const] : []),
      ...(clearPerplexity ? ['perplexity' as const] : []),
    ]
  }, [clearAnthropic, clearApify, clearInstantly, clearPerplexity])

  async function handleSave() {
    setSaving(true)
    setError(null)

    try {
      const nextSettings = await onSave({
        primaryLeadProvider,
        instantly:
          instantlyApiKey.trim() || instantlyWorkspaceId.trim()
            ? {
                ...(instantlyApiKey.trim() ? { apiKey: instantlyApiKey.trim() } : {}),
                ...(instantlyWorkspaceId.trim()
                  ? { workspaceId: instantlyWorkspaceId.trim() }
                  : {}),
              }
            : undefined,
        apifyApiToken: apifyApiToken.trim() || undefined,
        anthropicApiKey: anthropicApiKey.trim() || undefined,
        perplexityApiKey: perplexityApiKey.trim() || undefined,
        clear,
      })

      setSettings(nextSettings)
      setInstantlyApiKey('')
      setApifyApiToken('')
      setAnthropicApiKey('')
      setPerplexityApiKey('')
      setClearInstantly(false)
      setClearApify(false)
      setClearAnthropic(false)
      setClearPerplexity(false)
      setInstantlyWorkspaceId(nextSettings.providers.instantly.workspaceId ?? '')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save API keys')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-sm font-medium text-gray-300">Lead Discovery Provider</h2>
        <p className="mt-1 text-xs text-gray-500">
          Choose whether Fulcrum should try Instantly or Apify first for lead discovery.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            { value: 'instantly' as const, label: 'Instantly First' },
            { value: 'apify' as const, label: 'Apify First' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPrimaryLeadProvider(option.value)}
              className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                primaryLeadProvider === option.value
                  ? 'border-brand-cyan bg-brand-cyan/10 text-brand-cyan'
                  : 'border-gray-700 text-gray-300 hover:border-gray-500'
              }`}
            >
              <div className="font-medium">{option.label}</div>
              <div className="mt-1 text-xs text-gray-500">
                {option.value === 'instantly'
                  ? 'Use Instantly by default and fall back to Apify when available.'
                  : 'Use the legacy Apify flow first for discovery.'}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ProviderStatus
          label="Instantly"
          usingTenantKey={settings.providers.instantly.usingTenantKey}
          hasPlatformFallback={settings.providers.instantly.hasPlatformFallback}
        />
        <ProviderStatus
          label="Apify"
          usingTenantKey={settings.providers.apify.usingTenantKey}
          hasPlatformFallback={settings.providers.apify.hasPlatformFallback}
        />
        <ProviderStatus
          label="Anthropic"
          usingTenantKey={settings.providers.anthropic.usingTenantKey}
          hasPlatformFallback={settings.providers.anthropic.hasPlatformFallback}
        />
        <ProviderStatus
          label="Perplexity"
          usingTenantKey={settings.providers.perplexity.usingTenantKey}
          hasPlatformFallback={settings.providers.perplexity.hasPlatformFallback}
        />
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <h3 className="text-sm font-medium text-gray-300">Instantly</h3>
        <p className="text-xs text-gray-500">
          Leave the API key blank to keep the stored tenant secret. Clearing Instantly removes the
          tenant key and workspace override together.
        </p>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Workspace ID</label>
            <input
              type="text"
              value={instantlyWorkspaceId}
              onChange={(event) => setInstantlyWorkspaceId(event.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-600"
              placeholder="ws_123"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">API Key</label>
            <input
              type="password"
              value={instantlyApiKey}
              onChange={(event) => setInstantlyApiKey(event.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-600"
              placeholder="Paste a replacement Instantly API key"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={clearInstantly}
              onChange={(event) => setClearInstantly(event.target.checked)}
              className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-cyan"
            />
            Clear stored Instantly tenant credentials
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <h3 className="text-sm font-medium text-gray-300">Metered Provider Keys</h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Apify API Token</label>
            <input
              type="password"
              value={apifyApiToken}
              onChange={(event) => setApifyApiToken(event.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-600"
              placeholder="Leave blank to keep the stored token"
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={clearApify}
                onChange={(event) => setClearApify(event.target.checked)}
                className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-cyan"
              />
              Clear stored Apify tenant token
            </label>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">Anthropic API Key</label>
            <input
              type="password"
              value={anthropicApiKey}
              onChange={(event) => setAnthropicApiKey(event.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-600"
              placeholder="Leave blank to keep the stored key"
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={clearAnthropic}
                onChange={(event) => setClearAnthropic(event.target.checked)}
                className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-cyan"
              />
              Clear stored Anthropic tenant key
            </label>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">Perplexity API Key</label>
            <input
              type="password"
              value={perplexityApiKey}
              onChange={(event) => setPerplexityApiKey(event.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-600"
              placeholder="Leave blank to keep the stored key"
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={clearPerplexity}
                onChange={(event) => setClearPerplexity(event.target.checked)}
                className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-cyan"
              />
              Clear stored Perplexity tenant key
            </label>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-brand-cyan px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-cyan/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving...' : saveLabel}
        </button>
      </div>
    </div>
  )
}
