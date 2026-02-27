// components/ui/AIConfidenceMeter.tsx
'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface AIConfidenceMeterProps {
  calibrationActual: number        // 0.0 – 1.0
  calibrationGhost: number         // 0.0 – 1.0, always >= calibrationActual
  hasPendingFeedback: boolean
  showLabel?: boolean
  className?: string
}

export function AIConfidenceMeter({
  calibrationActual,
  calibrationGhost,
  hasPendingFeedback,
  showLabel = true,
  className = '',
}: AIConfidenceMeterProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  const actualPct = Math.round(calibrationActual * 100)
  const ghostPct = Math.round(calibrationGhost * 100)
  const ghostWidthPct = ghostPct - actualPct  // extra width for ghost segment

  return (
    <div className={`relative w-full ${className}`}>
      {/* Label row */}
      {showLabel && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            AI Confidence
          </span>
          <span className="text-sm font-semibold text-white">{actualPct}%</span>
        </div>
      )}

      {/* Meter bar */}
      <div
        className="relative h-3 w-full rounded-full bg-gray-800 overflow-hidden cursor-pointer"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onTouchStart={() => setShowTooltip(true)}
        onTouchEnd={() => setShowTooltip(false)}
        role="meter"
        aria-valuenow={actualPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`AI Confidence: ${actualPct}%`}
      >
        {/* Base fill — actual calibration */}
        <div
          className="absolute top-0 left-0 h-full rounded-full transition-all duration-500"
          style={{
            width: `${actualPct}%`,
            backgroundColor: '#00BCD4',
          }}
        />

        {/* Ghost segment — pending feedback */}
        <AnimatePresence>
          {hasPendingFeedback && ghostWidthPct > 0 && (
            <motion.div
              className="absolute top-0 h-full rounded-r-full"
              style={{
                left: `${actualPct}%`,
                width: `${ghostWidthPct}%`,
                backgroundColor: 'rgba(0, 188, 212, 0.35)',
              }}
              initial={{ opacity: 0, scaleX: 0.8 }}
              animate={{
                opacity: [0.35, 0.6, 0.35],
                scaleX: 1,
              }}
              exit={{ opacity: 0 }}
              transition={{
                opacity: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
                scaleX: { duration: 0.3 },
              }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            className="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-72 rounded-lg bg-gray-900 border border-gray-700 p-3 shadow-xl"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
          >
            <p className="text-xs text-gray-300 leading-relaxed">
              {hasPendingFeedback
                ? 'Fulcrum is processing your feedback. Calibration updates every 24 hours as your approvals and rejections are applied.'
                : `AI Confidence is at ${actualPct}%. Keep approving and rejecting leads to improve accuracy.`
              }
            </p>
            {hasPendingFeedback && (
              <p className="text-xs text-cyan-400 mt-1 font-medium">
                ↑ Projected: {ghostPct}% (pending sync)
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
