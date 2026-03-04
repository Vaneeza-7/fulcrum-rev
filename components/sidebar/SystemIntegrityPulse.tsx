'use client'
import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { IntegrityStatus } from '@/lib/types/integrity'

interface IntegrityDetail {
  signal: string
  status: IntegrityStatus
  message: string
}

interface IntegrityData {
  status: IntegrityStatus
  details: IntegrityDetail[]
  checkedAt: string
  crmHealth?: {
    level: IntegrityStatus
    queuedCount: number
    failedCount: number
    oldestQueuedMinutes: number | null
    duplicateRate30d: string
    paused: boolean
    message: string
    action: string
  }
}

interface SystemIntegrityPulseProps {
  pollIntervalMs?: number
  className?: string
}

const STATUS_CONFIG: Record<
  IntegrityStatus,
  { color: string; glow: string; label: string; pulseSpeed: number }
> = {
  GREEN: {
    color: '#10B981',
    glow: 'rgba(16,185,129,0.5)',
    label: 'System healthy',
    pulseSpeed: 2.5,
  },
  AMBER: {
    color: '#F59E0B',
    glow: 'rgba(245,158,11,0.5)',
    label: 'System warning',
    pulseSpeed: 1.5,
  },
  RED: {
    color: '#EF4444',
    glow: 'rgba(239,68,68,0.6)',
    label: 'System critical',
    pulseSpeed: 0.7,
  },
}

const SIGNAL_ICON: Record<string, string> = {
  credits: '\u{1F4B3}',
  queue: '\u2699\uFE0F',
  cron: '\u{1F550}',
  calibration: '\u{1F9EA}',
  crm_push_queue: '\u{1F4E4}',
}

export function SystemIntegrityPulse({
  pollIntervalMs = 60_000,
  className = '',
}: SystemIntegrityPulseProps) {
  const [data, setData] = useState<IntegrityData | null>(null)
  const [showTooltip, setShowTooltip] = useState(false)

  const fetchIntegrity = useCallback(async () => {
    try {
      const res = await fetch('/api/system/integrity')
      if (!res.ok) return
      const json: IntegrityData = await res.json()
      setData(json)
    } catch {
      // Silent fail — don't crash sidebar on network error
    }
  }, [])

  useEffect(() => {
    const initialFetch = setTimeout(fetchIntegrity, 0)
    const interval = setInterval(fetchIntegrity, pollIntervalMs)
    return () => {
      clearTimeout(initialFetch)
      clearInterval(interval)
    }
  }, [fetchIntegrity, pollIntervalMs])

  if (!data) {
    // Loading state — grey dot
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="h-2.5 w-2.5 rounded-full bg-gray-300 animate-pulse" />
        <span className="text-xs text-gray-400">Checking...</span>
      </div>
    )
  }

  const config = STATUS_CONFIG[data.status]

  return (
    <div
      className={`relative flex items-center gap-2 ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
    >
      {/* Animated dot */}
      <div className="relative flex h-3 w-3 items-center justify-center">
        {/* Pulse ring */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: config.glow }}
          animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: config.pulseSpeed, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Solid dot */}
        <motion.div
          className="relative h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: config.color }}
          animate={data.status === 'RED' ? { scale: [1, 1.15, 1] } : {}}
          transition={
            data.status === 'RED'
              ? { duration: config.pulseSpeed, repeat: Infinity, ease: 'easeInOut' }
              : {}
          }
        />
      </div>

      {/* Label */}
      <span className="text-xs font-medium" style={{ color: config.color }}>
        {config.label}
      </span>

      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.15 }}
            role="tooltip"
            className="absolute left-full top-1/2 z-50 ml-3 w-64 -translate-y-1/2 rounded-xl bg-gray-900 p-3 shadow-xl"
          >
            <p className="mb-2 text-xs font-semibold text-white">System Integrity</p>
            <div className="space-y-1.5">
              {data.details.map((detail) => (
                <div key={detail.signal} className="flex items-start gap-2">
                  <span className="mt-px text-sm leading-none">
                    {SIGNAL_ICON[detail.signal] ?? '\u{1F539}'}
                  </span>
                  <span
                    className={[
                      'text-xs leading-snug',
                      detail.status === 'RED'
                        ? 'text-red-400'
                        : detail.status === 'AMBER'
                        ? 'text-amber-400'
                        : 'text-emerald-400',
                    ].join(' ')}
                  >
                    {detail.message}
                  </span>
                </div>
              ))}
            </div>
            {data.crmHealth ? (
              <div className="mt-3 rounded-lg border border-gray-800 bg-gray-950/80 p-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  CRM Health
                </p>
                <p className="mt-1 text-xs text-white">{data.crmHealth.message}</p>
                <p className="mt-1 text-[10px] text-gray-500">{data.crmHealth.action}</p>
              </div>
            ) : null}
            <p className="mt-2 text-[10px] text-gray-500">
              Updated {new Date(data.checkedAt).toLocaleTimeString()}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
