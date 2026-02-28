'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { StepHeader } from '@/components/onboarding/StepHeader'

const TEMPLATES = [
  {
    id: 'hunhu',
    name: 'Hunhu',
    tagline: 'K-12 Education',
    description:
      'Target school superintendents, directors, and principals interested in student wellbeing and SEL.',
    queries: 3,
    keywords: 8,
  },
  {
    id: 'pulse',
    name: 'Pulse',
    tagline: 'SaaS Analytics',
    description:
      'Target SaaS founders, product leaders, and revenue teams focused on churn reduction and analytics.',
    queries: 3,
    keywords: 8,
  },
  {
    id: 'fulcrum_collective',
    name: 'Fulcrum Collective',
    tagline: 'RevOps Agency',
    description:
      'Target operational leaders and founders seeking CRM optimization, RevOps consulting, and process automation.',
    queries: 3,
    keywords: 8,
  },
  {
    id: 'custom',
    name: 'Custom',
    tagline: 'Start from scratch',
    description:
      'Define your own ICP, intent keywords, and scoring from a blank slate.',
    queries: 0,
    keywords: 0,
  },
]

export function Step1TemplateClient() {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleContinue() {
    if (!selected) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/onboarding/create-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: selected }),
      })

      if (res.ok) {
        router.push('/step-2')
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
        currentStep={1}
        title="Welcome to Fulcrum"
        description="Choose a template to pre-fill your Ideal Customer Profile, or start from scratch."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelected(t.id)}
            className={`rounded-xl border p-5 text-left transition-all ${
              selected === t.id
                ? 'border-cyan-500 bg-cyan-600/10 ring-1 ring-cyan-500'
                : 'border-gray-800 bg-gray-900 hover:border-gray-600'
            }`}
          >
            <div className="text-lg font-semibold text-white mb-1">{t.name}</div>
            <div className="text-xs text-cyan-400 uppercase tracking-wide mb-2">
              {t.tagline}
            </div>
            <p className="text-sm text-gray-400 mb-3">{t.description}</p>
            {t.queries > 0 && (
              <p className="text-xs text-gray-600">
                {t.queries} search queries · {t.keywords} intent keywords
              </p>
            )}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-400 mb-4">{error}</p>
      )}

      <button
        onClick={handleContinue}
        disabled={!selected || loading}
        className="w-full rounded-lg bg-cyan-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Setting up your workspace...' : 'Continue'}
      </button>
    </>
  )
}
