'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { StepHeader } from '@/components/onboarding/StepHeader'
import { TimezoneSelector } from '@/components/onboarding/TimezoneSelector'

const CRM_TYPES = ['zoho', 'hubspot', 'salesforce'] as const
type CrmType = (typeof CRM_TYPES)[number]

const CRM_LABELS: Record<CrmType, string> = {
  zoho: 'Zoho',
  hubspot: 'HubSpot',
  salesforce: 'Salesforce',
}

const CRM_FIELDS: Record<CrmType, Array<{ key: string; label: string }>> = {
  zoho: [
    { key: 'client_id', label: 'Client ID' },
    { key: 'client_secret', label: 'Client Secret' },
    { key: 'refresh_token', label: 'Refresh Token' },
    { key: 'org_id', label: 'Org ID' },
  ],
  hubspot: [{ key: 'api_key', label: 'API Key' }],
  salesforce: [
    { key: 'instance_url', label: 'Instance URL' },
    { key: 'client_id', label: 'Client ID' },
    { key: 'client_secret', label: 'Client Secret' },
    { key: 'refresh_token', label: 'Refresh Token' },
  ],
}

interface Props {
  initialDelivery?: {
    leadVolumeTarget: number
    scheduleType: string
    deliveryTime: string
    timezone: string
    crmEnabled: boolean
    slackEnabled: boolean
    emailEnabled: boolean
    emailAddress: string
  }
  currentCrmType?: string | null
  currentCrmConfig?: Record<string, string>
  hasSlack?: boolean
}

export function Step4DeliveryClient({
  initialDelivery,
  currentCrmType,
  currentCrmConfig,
  hasSlack,
}: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Volume & Schedule
  const [leadVolume, setLeadVolume] = useState(initialDelivery?.leadVolumeTarget ?? 25)
  const [scheduleType, setScheduleType] = useState(initialDelivery?.scheduleType ?? 'weekdays')

  // Parse delivery time into hour/period
  function parseTime(timeStr: string): { hour: number; period: 'AM' | 'PM' } {
    const [hStr] = timeStr.split(':')
    const h = parseInt(hStr, 10)
    if (h === 0) return { hour: 12, period: 'AM' }
    if (h === 12) return { hour: 12, period: 'PM' }
    if (h > 12) return { hour: h - 12, period: 'PM' }
    return { hour: h, period: 'AM' }
  }

  const parsed = parseTime(initialDelivery?.deliveryTime ?? '06:00')
  const [deliveryHour, setDeliveryHour] = useState(parsed.hour)
  const [deliveryPeriod, setDeliveryPeriod] = useState<'AM' | 'PM'>(parsed.period)
  const [timezone, setTimezone] = useState(initialDelivery?.timezone ?? 'America/New_York')

  // Channels
  const [crmEnabled, setCrmEnabled] = useState(initialDelivery?.crmEnabled ?? false)
  const [slackEnabled, setSlackEnabled] = useState(initialDelivery?.slackEnabled ?? false)
  const [emailEnabled, setEmailEnabled] = useState(initialDelivery?.emailEnabled ?? false)

  // CRM Config
  const [crmType, setCrmType] = useState<CrmType | ''>((currentCrmType as CrmType) ?? '')
  const [crmConfig, setCrmConfig] = useState<Record<string, string>>(currentCrmConfig ?? {})

  // Slack Config
  const [slackBotToken, setSlackBotToken] = useState('')
  const [slackChannelId, setSlackChannelId] = useState('')
  const [slackTeamId, setSlackTeamId] = useState('')

  // Email Config
  const [emailAddress, setEmailAddress] = useState(initialDelivery?.emailAddress ?? '')

  function updateCrmField(key: string, value: string) {
    setCrmConfig((prev) => ({ ...prev, [key]: value }))
  }

  function formatDeliveryTime(): string {
    let h = deliveryHour
    if (deliveryPeriod === 'AM') {
      if (h === 12) h = 0
    } else {
      if (h !== 12) h = h + 12
    }
    return `${h.toString().padStart(2, '0')}:00`
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!crmEnabled && !slackEnabled && !emailEnabled) {
      setError('Please enable at least one delivery channel.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/onboarding/save-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadVolumeTarget: leadVolume,
          scheduleType,
          deliveryTime: formatDeliveryTime(),
          timezone,
          crmEnabled,
          slackEnabled,
          emailEnabled,
          emailAddress: emailEnabled ? emailAddress.trim() : undefined,
          crmType: crmEnabled && crmType ? crmType : undefined,
          crmConfig: crmEnabled && crmType ? crmConfig : undefined,
          slackConfig:
            slackEnabled
              ? {
                  botToken: slackBotToken.trim(),
                  channelId: slackChannelId.trim(),
                  teamId: slackTeamId.trim(),
                }
              : undefined,
        }),
      })

      if (res.ok) {
        router.push('/step-5')
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Something went wrong. Please try again.')
        setLoading(false)
      }
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <>
      <StepHeader
        currentStep={4}
        title="Lead Delivery"
        description="Choose how and when you want to receive your qualified leads."
      />

      <p className="mb-3 text-xs text-gray-500">
        Fields marked <span className="text-red-400">*</span> are required.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section A: Volume & Schedule */}
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 space-y-5">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Volume & Schedule</h3>

          {/* Lead Volume */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Leads per day: <span className="text-brand-cyan font-semibold">{leadVolume}</span>
            </label>
            <input
              type="range"
              min={20}
              max={30}
              step={1}
              value={leadVolume}
              onChange={(e) => setLeadVolume(parseInt(e.target.value, 10))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-cyan"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>20</span>
              <span>30</span>
            </div>
          </div>

          {/* Schedule */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Schedule</label>
            <div className="flex gap-2">
              {[
                { value: 'weekdays', label: 'Weekdays (Mon-Fri)' },
                { value: 'daily', label: 'Every Day' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setScheduleType(opt.value)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    scheduleType === opt.value
                      ? 'bg-brand-cyan text-white'
                      : 'bg-gray-800 border border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Delivery Time */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Delivery time</label>
            <div className="flex gap-2">
              <select
                value={deliveryHour}
                onChange={(e) => setDeliveryHour(parseInt(e.target.value, 10))}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-cyan focus:border-transparent"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <select
                value={deliveryPeriod}
                onChange={(e) => setDeliveryPeriod(e.target.value as 'AM' | 'PM')}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-cyan focus:border-transparent"
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Timezone</label>
            <TimezoneSelector value={timezone} onChange={setTimezone} />
          </div>
        </div>

        {/* Section B: Delivery Channels */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
            Delivery Channels <span className="text-red-400">*</span>
          </h3>

          {/* CRM Integration */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
            <label className="flex items-center gap-3 p-4 cursor-pointer">
              <input
                type="checkbox"
                checked={crmEnabled}
                onChange={(e) => setCrmEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-cyan focus:ring-brand-cyan focus:ring-offset-0"
              />
              <span className="text-sm font-medium text-white">CRM Integration</span>
            </label>

            {crmEnabled && (
              <div className="border-t border-gray-800 p-4 space-y-4">
                {/* CRM Type Selector */}
                <div className="flex gap-2">
                  {CRM_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setCrmType(type)
                        setCrmConfig({})
                      }}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        crmType === type
                          ? 'bg-brand-cyan text-white'
                          : 'bg-gray-800 border border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                      }`}
                    >
                      {CRM_LABELS[type]}
                    </button>
                  ))}
                </div>

                {/* CRM Credential Fields */}
                {crmType && (
                  <div className="space-y-3">
                    {CRM_FIELDS[crmType].map((field) => (
                      <div key={field.key}>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">
                          {field.label}
                        </label>
                        <input
                          type="password"
                          value={crmConfig[field.key] ?? ''}
                          onChange={(e) => updateCrmField(field.key, e.target.value)}
                          placeholder={field.label}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-cyan focus:border-transparent"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Slack */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
            <label className="flex items-center gap-3 p-4 cursor-pointer">
              <input
                type="checkbox"
                checked={slackEnabled}
                onChange={(e) => setSlackEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-cyan focus:ring-brand-cyan focus:ring-offset-0"
              />
              <span className="text-sm font-medium text-white">Slack</span>
            </label>

            {slackEnabled && (
              <div className="border-t border-gray-800 p-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Bot Token</label>
                  <input
                    type="password"
                    value={slackBotToken}
                    onChange={(e) => setSlackBotToken(e.target.value)}
                    placeholder="xoxb-..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-cyan focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Channel ID</label>
                  <input
                    type="text"
                    value={slackChannelId}
                    onChange={(e) => setSlackChannelId(e.target.value)}
                    placeholder="C01234ABCDE"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-cyan focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Team ID</label>
                  <input
                    type="text"
                    value={slackTeamId}
                    onChange={(e) => setSlackTeamId(e.target.value)}
                    placeholder="T01234ABCDE"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-cyan focus:border-transparent"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Email Spreadsheet */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
            <label className="flex items-center gap-3 p-4 cursor-pointer">
              <input
                type="checkbox"
                checked={emailEnabled}
                onChange={(e) => setEmailEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-cyan focus:ring-brand-cyan focus:ring-offset-0"
              />
              <span className="text-sm font-medium text-white">Email Spreadsheet</span>
            </label>

            {emailEnabled && (
              <div className="border-t border-gray-800 p-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Email address</label>
                  <input
                    type="email"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-cyan focus:border-transparent"
                  />
                </div>
                <p className="text-xs text-gray-500">
                  We&apos;ll send you a spreadsheet of scored leads at your scheduled time.
                </p>
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-cyan px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-cyan/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Saving...' : 'Continue'}
        </button>
      </form>

      <a href="/step-3" className="block text-center text-sm text-gray-500 mt-4 hover:text-gray-400">
        Back
      </a>
    </>
  )
}
