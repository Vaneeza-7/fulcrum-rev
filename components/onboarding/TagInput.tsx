'use client'

import { useState, type KeyboardEvent } from 'react'

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  maxTags?: number
}

export function TagInput({ value, onChange, placeholder = 'Type and press Enter...', maxTags = 20 }: TagInputProps) {
  const [input, setInput] = useState('')

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
  }

  function addTag() {
    const trimmed = input.trim()
    if (!trimmed) return
    if (value.length >= maxTags) return

    // Prevent duplicates (case-insensitive)
    const isDuplicate = value.some(
      (tag) => tag.toLowerCase() === trimmed.toLowerCase()
    )
    if (isDuplicate) {
      setInput('')
      return
    }

    onChange([...value, trimmed])
    setInput('')
  }

  function removeTag(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((tag, i) => (
            <span
              key={`${tag}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-brand-cyan/20 border border-brand-cyan/40 px-3 py-1 text-xs text-brand-cyan"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(i)}
                className="ml-0.5 text-brand-cyan/60 hover:text-brand-cyan/80 transition-colors"
                aria-label={`Remove ${tag}`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="h-3 w-3"
                >
                  <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length >= maxTags ? `Maximum of ${maxTags} tags reached` : placeholder}
        disabled={value.length >= maxTags}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-1 focus:ring-brand-cyan focus:border-brand-cyan disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  )
}
