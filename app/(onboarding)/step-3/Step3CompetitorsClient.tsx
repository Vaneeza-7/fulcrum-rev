'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { StepHeader } from '@/components/onboarding/StepHeader'

interface CompetitorRow {
  name: string
  websiteUrl: string
  differentiator: string
}

interface Props {
  initialCompetitors?: CompetitorRow[]
  initialDifferentiation?: string
  initialWhyChooseUs?: string
}

const EMPTY_COMPETITOR: CompetitorRow = { name: '', websiteUrl: '', differentiator: '' }

export function Step3CompetitorsClient({
  initialCompetitors,
  initialDifferentiation,
  initialWhyChooseUs,
}: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [competitors, setCompetitors] = useState<CompetitorRow[]>(
    initialCompetitors && initialCompetitors.length > 0
      ? initialCompetitors
      : [{ ...EMPTY_COMPETITOR }]
  )
  const [differentiation, setDifferentiation] = useState(initialDifferentiation ?? '')
  const [whyChooseUs, setWhyChooseUs] = useState(initialWhyChooseUs ?? '')

  function addCompetitor() {
    if (competitors.length >= 10) return
    setCompetitors([...competitors, { ...EMPTY_COMPETITOR }])
  }

  function removeCompetitor(index: number) {
    setCompetitors(competitors.filter((_, i) => i !== index))
  }

  function updateCompetitor(index: number, field: keyof CompetitorRow, value: string) {
    const updated = [...competitors]
    updated[index] = { ...updated[index], [field]: value }
    setCompetitors(updated)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Filter out completely empty rows
    const validCompetitors = competitors.filter(
      (c) => c.name.trim() || c.websiteUrl.trim() || c.differentiator.trim()
    )

    try {
      const res = await fetch('/api/onboarding/save-competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competitors: validCompetitors.map((c) => ({
            name: c.name.trim(),
            websiteUrl: c.websiteUrl.trim() || undefined,
            differentiator: c.differentiator.trim() || undefined,
          })),
          differentiation: differentiation.trim() || undefined,
          whyChooseUs: whyChooseUs.trim() || undefined,
        }),
      })

      if (res.ok) {
        router.push('/step-4')
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

  function handleSkip() {
    router.push('/step-4')
  }

  return (
    <>
      <StepHeader
        currentStep={3}
        title="Competitors & Positioning"
        description="Help us understand your competitive landscape. This is optional but improves lead quality."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Competitor Rows */}
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 space-y-4">
          <label className="block text-sm font-medium text-gray-300 mb-1">Competitors</label>

          {competitors.map((comp, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="grid grid-cols-3 gap-2 flex-1">
                <input
                  type="text"
                  value={comp.name}
                  onChange={(e) => updateCompetitor(index, 'name', e.target.value)}
                  placeholder="Name"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent"
                />
                <input
                  type="text"
                  value={comp.websiteUrl}
                  onChange={(e) => updateCompetitor(index, 'websiteUrl', e.target.value)}
                  placeholder="Website"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent"
                />
                <input
                  type="text"
                  value={comp.differentiator}
                  onChange={(e) => updateCompetitor(index, 'differentiator', e.target.value)}
                  placeholder="How you differ"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent"
                />
              </div>
              <button
                type="button"
                onClick={() => removeCompetitor(index)}
                className="mt-2 text-gray-600 hover:text-gray-400 transition-colors"
                aria-label="Remove competitor"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addCompetitor}
            disabled={competitors.length >= 10}
            className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add competitor
          </button>
        </div>

        {/* General Differentiation */}
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 space-y-4">
          <div>
            <label htmlFor="differentiation" className="block text-sm font-medium text-gray-300 mb-1.5">
              General differentiator
            </label>
            <textarea
              id="differentiation"
              value={differentiation}
              onChange={(e) => setDifferentiation(e.target.value)}
              placeholder="What generally makes a prospect choose you over a competitor?"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent min-h-[80px] resize-none"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSkip}
            className="flex-1 rounded-lg border border-gray-700 px-6 py-2.5 text-sm font-semibold text-gray-400 hover:border-gray-600 hover:text-gray-300 transition-colors"
          >
            Skip
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-lg bg-cyan-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : 'Continue'}
          </button>
        </div>
      </form>

      <a href="/step-2" className="block text-center text-sm text-gray-500 mt-4 hover:text-gray-400">
        Back
      </a>
    </>
  )
}
