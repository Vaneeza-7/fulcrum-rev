'use client'

import { useState } from 'react'

export interface ScoringConfig {
  company_size: Array<{ min: number; max: number; points: number }>
  industry_fit: Array<{ match: string; points: number }>
  role_authority: Array<{ pattern: string; points: number }>
  revenue_signals: Array<{ signal: string; points: number }>
}

interface ScoringEditorProps {
  initialScoring: ScoringConfig
  onSave: (scoring: ScoringConfig) => Promise<void>
  saveLabel?: string
}

const DEFAULT_SCORING: ScoringConfig = {
  company_size: [
    { min: 1, max: 50, points: 10 },
    { min: 51, max: 200, points: 7 },
    { min: 201, max: 500, points: 5 },
  ],
  industry_fit: [
    { match: 'perfect', points: 8 },
    { match: 'adjacent', points: 5 },
    { match: 'neutral', points: 3 },
  ],
  role_authority: [
    { pattern: 'c_level', points: 15 },
    { pattern: 'vp_director', points: 12 },
    { pattern: 'manager', points: 7 },
    { pattern: 'ic', points: 3 },
  ],
  revenue_signals: [
    { signal: 'series_a', points: 7 },
    { signal: 'seed', points: 5 },
    { signal: 'budget_season', points: 3 },
  ],
}

export function ScoringEditor({ initialScoring, onSave, saveLabel = 'Save & Continue' }: ScoringEditorProps) {
  const hasData = initialScoring.company_size.length > 0
  const [scoring, setScoring] = useState<ScoringConfig>(hasData ? initialScoring : DEFAULT_SCORING)
  const [openSection, setOpenSection] = useState<string | null>('company_size')
  const [saving, setSaving] = useState(false)

  function updateCompanySize(index: number, field: 'min' | 'max' | 'points', value: number) {
    setScoring((prev) => {
      const next = { ...prev, company_size: [...prev.company_size] }
      next.company_size[index] = { ...next.company_size[index], [field]: value }
      return next
    })
  }

  function updateIndustryFit(index: number, field: 'match' | 'points', value: string | number) {
    setScoring((prev) => {
      const next = { ...prev, industry_fit: [...prev.industry_fit] }
      next.industry_fit[index] = { ...next.industry_fit[index], [field]: value }
      return next
    })
  }

  function updateRoleAuthority(index: number, field: 'pattern' | 'points', value: string | number) {
    setScoring((prev) => {
      const next = { ...prev, role_authority: [...prev.role_authority] }
      next.role_authority[index] = { ...next.role_authority[index], [field]: value }
      return next
    })
  }

  function updateRevenueSignals(index: number, field: 'signal' | 'points', value: string | number) {
    setScoring((prev) => {
      const next = { ...prev, revenue_signals: [...prev.revenue_signals] }
      next.revenue_signals[index] = { ...next.revenue_signals[index], [field]: value }
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(scoring)
    } finally {
      setSaving(false)
    }
  }

  const sections = [
    { key: 'company_size', label: 'Company Size' },
    { key: 'industry_fit', label: 'Industry Fit' },
    { key: 'role_authority', label: 'Role Authority' },
    { key: 'revenue_signals', label: 'Revenue Signals' },
  ]

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <div key={section.key} className="rounded-xl bg-gray-900 border border-gray-800">
          <button
            onClick={() => setOpenSection(openSection === section.key ? null : section.key)}
            className="w-full flex items-center justify-between p-4 text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            <span>{section.label}</span>
            <span className="text-gray-600">{openSection === section.key ? '−' : '+'}</span>
          </button>

          {openSection === section.key && (
            <div className="px-4 pb-4 space-y-2">
              {section.key === 'company_size' &&
                scoring.company_size.map((row, i) => (
                  <div key={i} className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={row.min}
                      onChange={(e) => updateCompanySize(i, 'min', Number(e.target.value))}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Max"
                      value={row.max}
                      onChange={(e) => updateCompanySize(i, 'max', Number(e.target.value))}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Points"
                      value={row.points}
                      onChange={(e) => updateCompanySize(i, 'points', Number(e.target.value))}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                    />
                  </div>
                ))}

              {section.key === 'industry_fit' &&
                scoring.industry_fit.map((row, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2">
                    <select
                      value={row.match}
                      onChange={(e) => updateIndustryFit(i, 'match', e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                    >
                      <option value="perfect">Perfect</option>
                      <option value="adjacent">Adjacent</option>
                      <option value="neutral">Neutral</option>
                    </select>
                    <input
                      type="number"
                      placeholder="Points"
                      value={row.points}
                      onChange={(e) => updateIndustryFit(i, 'points', Number(e.target.value))}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                    />
                  </div>
                ))}

              {section.key === 'role_authority' &&
                scoring.role_authority.map((row, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2">
                    <select
                      value={row.pattern}
                      onChange={(e) => updateRoleAuthority(i, 'pattern', e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                    >
                      <option value="c_level">C-Level</option>
                      <option value="vp_director">VP / Director</option>
                      <option value="manager">Manager</option>
                      <option value="ic">Individual Contributor</option>
                    </select>
                    <input
                      type="number"
                      placeholder="Points"
                      value={row.points}
                      onChange={(e) => updateRoleAuthority(i, 'points', Number(e.target.value))}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                    />
                  </div>
                ))}

              {section.key === 'revenue_signals' &&
                scoring.revenue_signals.map((row, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Signal name"
                      value={row.signal}
                      onChange={(e) => updateRevenueSignals(i, 'signal', e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Points"
                      value={row.points}
                      onChange={(e) => updateRevenueSignals(i, 'points', Number(e.target.value))}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                    />
                  </div>
                ))}
            </div>
          )}
        </div>
      ))}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-lg bg-brand-cyan px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-cyan/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? 'Saving...' : saveLabel}
      </button>
    </div>
  )
}
