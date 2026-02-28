'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { StepHeader } from '@/components/onboarding/StepHeader'
import { TagInput } from '@/components/onboarding/TagInput'

const TARGET_INDUSTRIES = [
  'Technology',
  'Healthcare',
  'Financial Services',
  'Education',
  'Manufacturing',
  'Professional Services',
  'Retail/E-Commerce',
  'Real Estate',
  'Energy',
  'Government',
  'Media/Entertainment',
  'Other',
]

const TARGET_COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001+']

interface Props {
  initialData?: {
    targetIndustries: string[]
    targetCompanySizes: string[]
    targetRoles: string[]
    targetGeography: string[]
    painPoints: string
    buyingSignals: string
    searchKeywords: string
  }
}

export function Step2ICPClient({ initialData }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [targetIndustries, setTargetIndustries] = useState<string[]>(initialData?.targetIndustries ?? [])
  const [targetCompanySizes, setTargetCompanySizes] = useState<string[]>(initialData?.targetCompanySizes ?? [])
  const [targetRoles, setTargetRoles] = useState<string[]>(initialData?.targetRoles ?? [])
  const [targetGeography, setTargetGeography] = useState<string[]>(initialData?.targetGeography ?? [])
  const [painPoints, setPainPoints] = useState(initialData?.painPoints ?? '')
  const [buyingSignals, setBuyingSignals] = useState(initialData?.buyingSignals ?? '')
  const [searchKeywords, setSearchKeywords] = useState(initialData?.searchKeywords ?? '')

  function toggleIndustry(ind: string) {
    setTargetIndustries((prev) =>
      prev.includes(ind) ? prev.filter((i) => i !== ind) : [...prev, ind]
    )
  }

  function toggleCompanySize(size: string) {
    setTargetCompanySizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/onboarding/save-icp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetIndustries,
          targetCompanySizes,
          targetRoles,
          targetGeography,
          painPoints: painPoints.trim() || undefined,
          buyingSignals: buyingSignals.trim() || undefined,
          searchKeywords: searchKeywords.trim() || undefined,
        }),
      })

      if (res.ok) {
        router.push('/step-3')
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
        currentStep={2}
        title="Your Ideal Customer"
        description="The more specific you are, the more accurate your leads will be."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Target Industries */}
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
          <label className="block text-sm font-medium text-gray-300 mb-3">Target industries</label>
          <div className="grid grid-cols-2 gap-2">
            {TARGET_INDUSTRIES.map((ind) => (
              <button
                key={ind}
                type="button"
                onClick={() => toggleIndustry(ind)}
                className={`rounded-lg px-3 py-2 text-sm text-left transition-colors ${
                  targetIndustries.includes(ind)
                    ? 'bg-cyan-600/20 border border-cyan-600/40 text-cyan-400'
                    : 'bg-gray-800 border border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded border text-xs ${
                      targetIndustries.includes(ind)
                        ? 'border-cyan-500 bg-cyan-600 text-white'
                        : 'border-gray-600'
                    }`}
                  >
                    {targetIndustries.includes(ind) && (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                        <path
                          fillRule="evenodd"
                          d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </span>
                  {ind}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Target Company Sizes */}
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
          <label className="block text-sm font-medium text-gray-300 mb-3">Target company sizes</label>
          <div className="flex flex-wrap gap-2">
            {TARGET_COMPANY_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => toggleCompanySize(size)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  targetCompanySizes.includes(size)
                    ? 'bg-cyan-600 text-white'
                    : 'bg-gray-800 border border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        {/* Decision Makers & Geography */}
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Decision makers</label>
            <TagInput
              value={targetRoles}
              onChange={setTargetRoles}
              placeholder="Type a job title and press Enter"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Target geography</label>
            <TagInput
              value={targetGeography}
              onChange={setTargetGeography}
              placeholder="Type a location and press Enter"
            />
          </div>
        </div>

        {/* Pain Points, Buying Signals, Keywords */}
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 space-y-4">
          <div>
            <label htmlFor="painPoints" className="block text-sm font-medium text-gray-300 mb-1.5">
              Pain points
            </label>
            <textarea
              id="painPoints"
              value={painPoints}
              onChange={(e) => setPainPoints(e.target.value)}
              placeholder="What problems do your ideal customers struggle with?"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent min-h-[80px] resize-none"
            />
          </div>

          <div>
            <label htmlFor="buyingSignals" className="block text-sm font-medium text-gray-300 mb-1.5">
              Buying signals
            </label>
            <textarea
              id="buyingSignals"
              value={buyingSignals}
              onChange={(e) => setBuyingSignals(e.target.value)}
              placeholder="What events indicate a prospect is ready to buy? (e.g., new funding, hiring spree, vendor switch)"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent min-h-[80px] resize-none"
            />
          </div>

          <div>
            <label htmlFor="searchKeywords" className="block text-sm font-medium text-gray-300 mb-1.5">
              Keywords
            </label>
            <textarea
              id="searchKeywords"
              value={searchKeywords}
              onChange={(e) => setSearchKeywords(e.target.value)}
              placeholder="What would prospects search for when looking for solutions like yours?"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent min-h-[80px] resize-none"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-cyan-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Saving...' : 'Continue'}
        </button>
      </form>

      <a href="/step-1" className="block text-center text-sm text-gray-500 mt-4 hover:text-gray-400">
        Back
      </a>
    </>
  )
}
