'use client'

import { useState } from 'react'

export interface IntentKeyword {
  keyword: string
  intentScore: number
  category: string
}

interface KeywordEditorProps {
  initialKeywords: IntentKeyword[]
  onSave: (keywords: IntentKeyword[]) => Promise<void>
  saveLabel?: string
}

export function KeywordEditor({ initialKeywords, onSave, saveLabel = 'Save & Continue' }: KeywordEditorProps) {
  const [keywords, setKeywords] = useState<IntentKeyword[]>(
    initialKeywords.length > 0
      ? initialKeywords
      : [{ keyword: '', intentScore: 5, category: '' }]
  )
  const [saving, setSaving] = useState(false)

  function updateKeyword(index: number, field: keyof IntentKeyword, value: string | number) {
    setKeywords((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  function addKeyword() {
    setKeywords((prev) => [...prev, { keyword: '', intentScore: 5, category: '' }])
  }

  function removeKeyword(index: number) {
    setKeywords((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(keywords)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {keywords.map((k, i) => (
        <div key={i} className="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-400 uppercase tracking-wide">
              Keyword {i + 1}
            </label>
            {keywords.length > 1 && (
              <button
                onClick={() => removeKeyword(i)}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Remove
              </button>
            )}
          </div>
          <input
            type="text"
            placeholder="Intent keyword (e.g. reduce SaaS churn)"
            value={k.keyword}
            onChange={(e) => updateKeyword(i, 'keyword', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-gray-600"
          />
          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                Score: {k.intentScore}
              </label>
              <input
                type="range"
                min={1}
                max={10}
                value={k.intentScore}
                onChange={(e) => updateKeyword(i, 'intentScore', Number(e.target.value))}
                className="w-full accent-brand-cyan"
              />
            </div>
            <input
              type="text"
              placeholder="Category"
              value={k.category}
              onChange={(e) => updateKeyword(i, 'category', e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-gray-600"
            />
          </div>
        </div>
      ))}

      <button
        onClick={addKeyword}
        className="w-full rounded-lg border border-dashed border-gray-700 py-3 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-300 transition-colors"
      >
        + Add Intent Keyword
      </button>

      <button
        onClick={handleSave}
        disabled={saving || keywords.some((k) => !k.keyword)}
        className="w-full rounded-lg bg-brand-cyan px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-cyan/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? 'Saving...' : saveLabel}
      </button>
    </div>
  )
}
