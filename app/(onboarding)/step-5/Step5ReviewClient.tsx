'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { StepHeader } from '@/components/onboarding/StepHeader'

interface Props {
  company: {
    companyName: string
    websiteUrl?: string | null
    industry?: string | null
    companySize?: string | null
    productDescription?: string | null
    problemsSolved?: string | null
    valueProposition?: string | null
  }
  icp: {
    targetIndustries: string[]
    targetCompanySizes: string[]
    targetRoles: string[]
    targetGeography: string[]
    painPoints?: string | null
    buyingSignals?: string | null
  }
  competitors: Array<{ name: string; websiteUrl?: string | null; differentiator?: string | null }>
  delivery: {
    leadVolumeTarget: number
    scheduleType: string
    deliveryTime: string
    timezone: string
    channels: string[]
  } | null
  initialConfig?: {
    searchQueries: Array<{ queryName: string; searchQuery: any }>
    intentKeywords: Array<{ keyword: string; intentScore: number; category: string }>
  } | null
}

type ViewState = 'review' | 'generating' | 'preview'

const GENERATING_MESSAGES = [
  'Analyzing your ideal customer profile...',
  'Generating search queries...',
  'Building intent signal keywords...',
  'Calibrating scoring model...',
  'Almost ready...',
]

const CHANNEL_LABELS: Record<string, string> = {
  crm: 'CRM',
  slack: 'Slack',
  email: 'Email Spreadsheet',
}

export function Step5ReviewClient({ company, icp, competitors, delivery, initialConfig }: Props) {
  const router = useRouter()
  const [viewState, setViewState] = useState<ViewState>(initialConfig ? 'preview' : 'review')
  const [error, setError] = useState<string | null>(null)
  const [generatingMessage, setGeneratingMessage] = useState(GENERATING_MESSAGES[0])
  const [config, setConfig] = useState(initialConfig ?? null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  function startGenerating() {
    setViewState('generating')
    setError(null)

    let msgIndex = 0
    intervalRef.current = setInterval(() => {
      msgIndex = (msgIndex + 1) % GENERATING_MESSAGES.length
      setGeneratingMessage(GENERATING_MESSAGES[msgIndex])
    }, 2500)

    fetch('/api/onboarding/generate-and-launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(async (res) => {
        if (intervalRef.current) clearInterval(intervalRef.current)

        if (res.ok) {
          const data = await res.json()
          setConfig({
            searchQueries: data.searchQueries ?? [],
            intentKeywords: data.intentKeywords ?? [],
          })
          setViewState('preview')
        } else {
          const data = await res.json().catch(() => ({}))
          setError(data.error ?? 'Something went wrong generating your pipeline. Please try again.')
          setViewState('review')
        }
      })
      .catch(() => {
        if (intervalRef.current) clearInterval(intervalRef.current)
        setError('Network error. Please try again.')
        setViewState('review')
      })
  }

  function formatDeliveryTime(time: string): string {
    const [hStr] = time.split(':')
    const h = parseInt(hStr, 10)
    if (h === 0) return '12:00 AM'
    if (h === 12) return '12:00 PM'
    if (h > 12) return `${h - 12}:00 PM`
    return `${h}:00 AM`
  }

  function getScoreBadgeColor(score: number): string {
    if (score >= 8) return 'bg-green-600/20 text-green-400 border-green-600/40'
    if (score >= 5) return 'bg-yellow-600/20 text-yellow-400 border-yellow-600/40'
    return 'bg-red-600/20 text-red-400 border-red-600/40'
  }

  // ─── Review State ───────────────────────────────────────────────
  if (viewState === 'review') {
    return (
      <>
        <StepHeader
          currentStep={5}
          title="Review & Launch"
          description="Review your setup and launch your lead pipeline."
        />

        <div className="space-y-4">
          {/* Company Card */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Your Company</h3>
              <a href="/step-1" className="text-xs text-brand-cyan hover:text-brand-cyan/80 transition-colors">
                Edit
              </a>
            </div>
            <div className="space-y-2 text-sm">
              <div className="text-white font-medium">{company.companyName}</div>
              {company.industry && (
                <div className="text-gray-400">
                  {company.industry}
                  {company.companySize && <span> &middot; {company.companySize} employees</span>}
                </div>
              )}
              {company.productDescription && (
                <p className="text-gray-400">{company.productDescription}</p>
              )}
            </div>
          </div>

          {/* ICP Card */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Ideal Customer</h3>
              <a href="/step-2" className="text-xs text-brand-cyan hover:text-brand-cyan/80 transition-colors">
                Edit
              </a>
            </div>
            <div className="space-y-3 text-sm">
              {icp.targetIndustries.length > 0 && (
                <div>
                  <span className="text-gray-500">Industries: </span>
                  <span className="text-gray-300">{icp.targetIndustries.join(', ')}</span>
                </div>
              )}
              {icp.targetCompanySizes.length > 0 && (
                <div>
                  <span className="text-gray-500">Company sizes: </span>
                  <span className="text-gray-300">{icp.targetCompanySizes.join(', ')}</span>
                </div>
              )}
              {icp.targetRoles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-gray-500">Roles: </span>
                  {icp.targetRoles.map((role) => (
                    <span
                      key={role}
                      className="inline-block rounded-full bg-brand-cyan/20 border border-brand-cyan/40 px-2.5 py-0.5 text-xs text-brand-cyan"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              )}
              {icp.targetGeography.length > 0 && (
                <div>
                  <span className="text-gray-500">Geography: </span>
                  <span className="text-gray-300">{icp.targetGeography.join(', ')}</span>
                </div>
              )}
              {icp.painPoints && (
                <div>
                  <span className="text-gray-500">Pain points: </span>
                  <span className="text-gray-300">
                    {icp.painPoints.length > 120
                      ? icp.painPoints.slice(0, 120) + '...'
                      : icp.painPoints}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Competitors Card */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Competitors</h3>
              <a href="/step-3" className="text-xs text-brand-cyan hover:text-brand-cyan/80 transition-colors">
                Edit
              </a>
            </div>
            {competitors.length > 0 ? (
              <ul className="space-y-1.5 text-sm">
                {competitors.map((c, i) => (
                  <li key={i} className="text-gray-300">
                    <span className="text-white font-medium">{c.name}</span>
                    {c.websiteUrl && (
                      <span className="text-gray-500 ml-2">{c.websiteUrl}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">None added</p>
            )}
          </div>

          {/* Delivery Card */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Delivery</h3>
              <a href="/step-4" className="text-xs text-brand-cyan hover:text-brand-cyan/80 transition-colors">
                Edit
              </a>
            </div>
            {delivery ? (
              <div className="space-y-1.5 text-sm">
                <div className="text-gray-300">
                  <span className="text-brand-cyan font-medium">{delivery.leadVolumeTarget}</span> leads/day
                </div>
                <div className="text-gray-400">
                  {delivery.scheduleType === 'weekdays' ? 'Weekdays (Mon-Fri)' : 'Every Day'} at{' '}
                  {formatDeliveryTime(delivery.deliveryTime)} {delivery.timezone}
                </div>
                <div className="flex gap-2 mt-2">
                  {delivery.channels.map((ch) => (
                    <span
                      key={ch}
                      className="inline-block rounded-full bg-gray-800 border border-gray-700 px-2.5 py-0.5 text-xs text-gray-400"
                    >
                      {CHANNEL_LABELS[ch] ?? ch}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Not configured yet</p>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-red-400 mt-4">{error}</p>}

        <button
          onClick={startGenerating}
          className="mt-6 w-full rounded-lg bg-brand-cyan px-6 py-3 text-sm font-semibold text-white hover:bg-brand-cyan/80 transition-colors"
        >
          Launch My Pipeline
        </button>

        <a href="/step-4" className="block text-center text-sm text-gray-500 mt-4 hover:text-gray-400">
          Back
        </a>
      </>
    )
  }

  // ─── Generating State ───────────────────────────────────────────
  if (viewState === 'generating') {
    return (
      <>
        <StepHeader
          currentStep={5}
          title="Review & Launch"
          description="Building your custom lead pipeline..."
        />

        <div className="flex flex-col items-center justify-center py-20">
          {/* Pulsing animation */}
          <div className="relative mb-8">
            <div className="h-16 w-16 rounded-full bg-brand-cyan/20 animate-ping absolute inset-0" />
            <div className="h-16 w-16 rounded-full bg-brand-cyan/40 flex items-center justify-center relative">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-8 w-8 text-brand-cyan animate-spin"
              >
                <path
                  fillRule="evenodd"
                  d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903h-3.183a.75.75 0 1 0 0 1.5h4.992a.75.75 0 0 0 .75-.75V4.356a.75.75 0 0 0-1.5 0v3.18l-1.9-1.9A9 9 0 0 0 3.306 9.67a.75.75 0 1 0 1.45.388Zm15.408 3.352a.75.75 0 0 0-.919.53 7.5 7.5 0 0 1-12.548 3.364l-1.902-1.903h3.183a.75.75 0 0 0 0-1.5H2.984a.75.75 0 0 0-.75.75v4.992a.75.75 0 0 0 1.5 0v-3.18l1.9 1.9a9 9 0 0 0 15.059-4.035.75.75 0 0 0-.53-.918Z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>

          <p className="text-lg text-gray-300 animate-pulse text-center">{generatingMessage}</p>
        </div>
      </>
    )
  }

  // ─── Preview State ──────────────────────────────────────────────
  return (
    <>
      <StepHeader
        currentStep={5}
        title="Review & Launch"
        description="Your pipeline is ready."
      />

      <h2 className="text-lg font-semibold text-white mb-4">
        Here&apos;s what we built for you:
      </h2>

      <div className="space-y-4">
        {/* Search Queries Card */}
        {config && config.searchQueries.length > 0 && (
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">
              Search Queries
            </h3>
            <div className="space-y-3">
              {config.searchQueries.map((q, i) => (
                <div key={i} className="rounded-lg bg-gray-800/50 border border-gray-700 p-3">
                  <div className="text-sm font-medium text-white mb-1">{q.queryName}</div>
                  <div className="text-xs text-gray-400">
                    {typeof q.searchQuery === 'object' && q.searchQuery !== null
                      ? Object.entries(q.searchQuery)
                          .filter(([, v]) => v)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' | ')
                      : String(q.searchQuery)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Intent Keywords Card */}
        {config && config.intentKeywords.length > 0 && (
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">
              Intent Keywords
            </h3>
            <div className="flex flex-wrap gap-2">
              {config.intentKeywords.map((kw, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${getScoreBadgeColor(
                    kw.intentScore
                  )}`}
                >
                  {kw.keyword}
                  <span className="font-semibold">{kw.intentScore}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Scoring Summary Card */}
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">
            Scoring Model
          </h3>
          <p className="text-sm text-gray-400">
            Leads are scored using a multi-factor model that weighs company fit, role authority,
            industry match, and intent signals. Scores are calibrated during a 30-day cold-start
            period, then continuously refined based on your feedback.
          </p>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={() => {
            setConfig(null)
            startGenerating()
          }}
          className="flex-1 rounded-lg border border-gray-700 px-6 py-2.5 text-sm font-semibold text-gray-400 hover:border-gray-600 hover:text-gray-300 transition-colors"
        >
          Regenerate
        </button>
        <button
          onClick={() => router.push('/step-6')}
          className="flex-1 rounded-lg bg-brand-cyan px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-cyan/80 transition-colors"
        >
          Continue to Calibration &rarr;
        </button>
      </div>

      <a href="/step-4" className="block text-center text-sm text-gray-500 mt-4 hover:text-gray-400">
        Back
      </a>
    </>
  )
}
