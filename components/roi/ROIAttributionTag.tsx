'use client'
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ROIAttributionLabel } from '@/lib/roi/attribution-types'

interface ROIAttributionTagProps {
  label: ROIAttributionLabel
  tooltipText: string
  className?: string
}

const LABEL_CONFIG: Record<
  ROIAttributionLabel,
  { color: string; bg: string; border: string; display: string }
> = {
  ESTIMATED: {
    color: '#92400E',
    bg: '#FEF3C7',
    border: '#F59E0B',
    display: 'ESTIMATED',
  },
  VERIFIED: {
    color: '#064E3B',
    bg: '#D1FAE5',
    border: '#10B981',
    display: 'VERIFIED',
  },
  MIXED: {
    color: '#4C1D95',
    bg: '#EDE9FE',
    border: '#8B5CF6',
    display: 'MIXED',
  },
}

export function ROIAttributionTag({ label, tooltipText, className = '' }: ROIAttributionTagProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const config = LABEL_CONFIG[label]

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        role="status"
        aria-label={`ROI Attribution: ${label}. ${tooltipText}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        onClick={() => setShowTooltip((v) => !v)}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide border cursor-help select-none"
        style={{
          color: config.color,
          backgroundColor: config.bg,
          borderColor: config.border,
        }}
      >
        [{config.display}]
      </button>

      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            role="tooltip"
            className="absolute bottom-full left-0 z-50 mb-1 w-56 rounded-md bg-gray-900 px-3 py-2 text-xs text-white shadow-lg"
          >
            {tooltipText}
            <div className="absolute left-3 top-full h-0 w-0 border-x-4 border-x-transparent border-t-4 border-t-gray-900" />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}
