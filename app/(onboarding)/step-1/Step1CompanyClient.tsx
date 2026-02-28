'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { StepHeader } from '@/components/onboarding/StepHeader'

const INDUSTRIES = [
  'Technology',
  'Healthcare',
  'Financial Services',
  'Education',
  'Manufacturing',
  'Professional Services',
  'Retail/E-Commerce',
  'Real Estate',
  'Other',
]

const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001+']

interface Props {
  existingName?: string
}

export function Step1CompanyClient({ existingName }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [companyName, setCompanyName] = useState(existingName ?? '')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [industry, setIndustry] = useState('')
  const [companySize, setCompanySize] = useState('')
  const [productDescription, setProductDescription] = useState('')
  const [problemsSolved, setProblemsSolved] = useState('')
  const [valueProposition, setValueProposition] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!companyName.trim()) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/onboarding/create-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: companyName.trim(),
          websiteUrl: websiteUrl.trim() || undefined,
          industry: industry || undefined,
          companySize: companySize || undefined,
          productDescription: productDescription.trim() || undefined,
          problemsSolved: problemsSolved.trim() || undefined,
          valueProposition: valueProposition.trim() || undefined,
        }),
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
        title="Your Company"
        description="Tell us about your business so we can find your ideal customers."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Company Basics */}
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 space-y-4">
          <div>
            <label htmlFor="companyName" className="block text-sm font-medium text-gray-300 mb-1.5">
              Company name <span className="text-red-400">*</span>
            </label>
            <input
              id="companyName"
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Inc."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="websiteUrl" className="block text-sm font-medium text-gray-300 mb-1.5">
              Website URL
            </label>
            <input
              id="websiteUrl"
              type="text"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="industry" className="block text-sm font-medium text-gray-300 mb-1.5">
              Industry
            </label>
            <select
              id="industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent"
            >
              <option value="">Select an industry...</option>
              {INDUSTRIES.map((ind) => (
                <option key={ind} value={ind}>
                  {ind}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Company size</label>
            <div className="flex flex-wrap gap-2">
              {COMPANY_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setCompanySize(companySize === size ? '' : size)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    companySize === size
                      ? 'bg-cyan-600 text-white'
                      : 'bg-gray-800 border border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Product & Value */}
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 space-y-4">
          <div>
            <label htmlFor="productDescription" className="block text-sm font-medium text-gray-300 mb-1.5">
              What do you sell?
            </label>
            <textarea
              id="productDescription"
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              placeholder="Describe your product or service in 1-2 sentences"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent min-h-[80px] resize-none"
            />
          </div>

          <div>
            <label htmlFor="problemsSolved" className="block text-sm font-medium text-gray-300 mb-1.5">
              What problems do you solve?
            </label>
            <textarea
              id="problemsSolved"
              value={problemsSolved}
              onChange={(e) => setProblemsSolved(e.target.value)}
              placeholder="What challenges do your customers face before using your solution?"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent min-h-[80px] resize-none"
            />
          </div>

          <div>
            <label htmlFor="valueProposition" className="block text-sm font-medium text-gray-300 mb-1.5">
              What makes you different?
            </label>
            <textarea
              id="valueProposition"
              value={valueProposition}
              onChange={(e) => setValueProposition(e.target.value)}
              placeholder="Why do customers choose you over alternatives?"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent min-h-[80px] resize-none"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={!companyName.trim() || loading}
          className="w-full rounded-lg bg-cyan-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Setting up your workspace...' : 'Continue'}
        </button>
      </form>
    </>
  )
}
