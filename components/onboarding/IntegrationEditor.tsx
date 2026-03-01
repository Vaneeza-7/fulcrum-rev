'use client'

import { useState } from 'react'

interface IntegrationEditorProps {
  currentCrmType?: string
  currentCrmConfig?: Record<string, string>
  hasSlack?: boolean
  onSave: (data: {
    crmType?: string
    crmConfig?: Record<string, string>
    slack?: { teamId: string; botToken: string; channelId: string }
  }) => Promise<void>
  saveLabel?: string
  showSkip?: boolean
  onSkip?: () => void
}

const CRM_OPTIONS = [
  { value: 'zoho', label: 'Zoho CRM' },
  { value: 'hubspot', label: 'HubSpot' },
  { value: 'salesforce', label: 'Salesforce' },
]

const CRM_FIELDS: Record<string, Array<{ key: string; label: string; type?: string }>> = {
  zoho: [
    { key: 'client_id', label: 'Client ID' },
    { key: 'client_secret', label: 'Client Secret', type: 'password' },
    { key: 'refresh_token', label: 'Refresh Token', type: 'password' },
    { key: 'org_id', label: 'Organization ID' },
  ],
  hubspot: [
    { key: 'api_key', label: 'API Key', type: 'password' },
  ],
  salesforce: [
    { key: 'instance_url', label: 'Instance URL' },
    { key: 'client_id', label: 'Client ID' },
    { key: 'client_secret', label: 'Client Secret', type: 'password' },
    { key: 'refresh_token', label: 'Refresh Token', type: 'password' },
  ],
}

export function IntegrationEditor({
  currentCrmType,
  currentCrmConfig,
  hasSlack,
  onSave,
  saveLabel = 'Save & Continue',
  showSkip = false,
  onSkip,
}: IntegrationEditorProps) {
  const [crmType, setCrmType] = useState(currentCrmType ?? 'zoho')
  const [crmConfig, setCrmConfig] = useState<Record<string, string>>(currentCrmConfig ?? {})
  const [slackBotToken, setSlackBotToken] = useState('')
  const [slackChannelId, setSlackChannelId] = useState('')
  const [slackTeamId, setSlackTeamId] = useState('')
  const [saving, setSaving] = useState(false)

  function updateCrmField(key: string, value: string) {
    setCrmConfig((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const data: Parameters<typeof onSave>[0] = {}
      if (Object.values(crmConfig).some((v) => v)) {
        data.crmType = crmType
        data.crmConfig = crmConfig
      }
      if (slackBotToken && slackChannelId) {
        data.slack = { teamId: slackTeamId, botToken: slackBotToken, channelId: slackChannelId }
      }
      await onSave(data)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* CRM Section */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-4">
        <h3 className="text-sm font-medium text-gray-300">CRM Integration</h3>
        <div className="flex gap-3">
          {CRM_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setCrmType(opt.value)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                crmType === opt.value
                  ? 'border-brand-cyan bg-brand-cyan/10 text-brand-cyan'
                  : 'border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {CRM_FIELDS[crmType]?.map((field) => (
            <div key={field.key}>
              <label className="text-xs text-gray-500 mb-1 block">{field.label}</label>
              <input
                type={field.type ?? 'text'}
                value={crmConfig[field.key] ?? ''}
                onChange={(e) => updateCrmField(field.key, e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-gray-600"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Slack Section */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-4">
        <h3 className="text-sm font-medium text-gray-300">
          Slack Notifications
          {hasSlack && <span className="ml-2 text-xs text-emerald-400">Connected</span>}
        </h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Bot Token</label>
            <input
              type="password"
              placeholder="xoxb-..."
              value={slackBotToken}
              onChange={(e) => setSlackBotToken(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-gray-600"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Channel ID</label>
            <input
              type="text"
              placeholder="C0AJEHZD2JC"
              value={slackChannelId}
              onChange={(e) => setSlackChannelId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-gray-600"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Team ID</label>
            <input
              type="text"
              placeholder="T01234567"
              value={slackTeamId}
              onChange={(e) => setSlackTeamId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-gray-600"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        {showSkip && onSkip && (
          <button
            onClick={onSkip}
            className="flex-1 rounded-lg border border-gray-700 px-6 py-2.5 text-sm font-medium text-gray-400 hover:text-gray-300 hover:border-gray-500 transition-colors"
          >
            Skip for Now
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-lg bg-brand-cyan px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-cyan/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : saveLabel}
        </button>
      </div>
    </div>
  )
}
