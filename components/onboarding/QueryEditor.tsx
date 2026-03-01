'use client'

import { useState } from 'react'

export interface SearchQuery {
  queryName: string
  searchQuery: {
    keywords: string
    industry?: string
    companySize?: string
    additionalKeywords?: string
  }
  maxResults?: number
}

interface QueryEditorProps {
  initialQueries: SearchQuery[]
  onSave: (queries: SearchQuery[]) => Promise<void>
  saveLabel?: string
}

export function QueryEditor({ initialQueries, onSave, saveLabel = 'Save & Continue' }: QueryEditorProps) {
  const [queries, setQueries] = useState<SearchQuery[]>(
    initialQueries.length > 0
      ? initialQueries
      : [{ queryName: '', searchQuery: { keywords: '' } }]
  )
  const [saving, setSaving] = useState(false)

  function updateQuery(index: number, field: string, value: string) {
    setQueries((prev) => {
      const next = [...prev]
      if (field === 'queryName') {
        next[index] = { ...next[index], queryName: value }
      } else {
        next[index] = {
          ...next[index],
          searchQuery: { ...next[index].searchQuery, [field]: value },
        }
      }
      return next
    })
  }

  function addQuery() {
    setQueries((prev) => [...prev, { queryName: '', searchQuery: { keywords: '' } }])
  }

  function removeQuery(index: number) {
    setQueries((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(queries)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {queries.map((q, i) => (
        <div key={i} className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-400 uppercase tracking-wide">
              Query {i + 1}
            </label>
            {queries.length > 1 && (
              <button
                onClick={() => removeQuery(i)}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Remove
              </button>
            )}
          </div>
          <input
            type="text"
            placeholder="Query name (e.g. CEO Search)"
            value={q.queryName}
            onChange={(e) => updateQuery(i, 'queryName', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-gray-600"
          />
          <input
            type="text"
            placeholder="Keywords (e.g. CEO OR CTO OR Founder)"
            value={q.searchQuery.keywords}
            onChange={(e) => updateQuery(i, 'keywords', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-gray-600"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Industry"
              value={q.searchQuery.industry ?? ''}
              onChange={(e) => updateQuery(i, 'industry', e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-gray-600"
            />
            <input
              type="text"
              placeholder="Company size (e.g. 11-200)"
              value={q.searchQuery.companySize ?? ''}
              onChange={(e) => updateQuery(i, 'companySize', e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-gray-600"
            />
          </div>
          <input
            type="text"
            placeholder="Additional keywords"
            value={q.searchQuery.additionalKeywords ?? ''}
            onChange={(e) => updateQuery(i, 'additionalKeywords', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-gray-600"
          />
        </div>
      ))}

      <button
        onClick={addQuery}
        className="w-full rounded-lg border border-dashed border-gray-700 py-3 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-300 transition-colors"
      >
        + Add Search Query
      </button>

      <button
        onClick={handleSave}
        disabled={saving || queries.some((q) => !q.queryName || !q.searchQuery.keywords)}
        className="w-full rounded-lg bg-brand-cyan px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-cyan/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? 'Saving...' : saveLabel}
      </button>
    </div>
  )
}
