// components/dashboard/CalibrationWidget.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useCalibrationGhost } from '@/hooks/useCalibrationGhost'
import { AIConfidenceMeter } from '@/components/ui/AIConfidenceMeter'

interface CalibrationWidgetProps {
  /** Initial calibration significance from the server (0.0–1.0) */
  initialCalibration: number
  /** Whether the tenant is in cold-start */
  coldStartActive: boolean
  /** Days remaining in cold-start (null if not active) */
  daysRemaining: number | null
  /** Poll interval in ms for refetching calibration (default: 60000) */
  pollIntervalMs?: number
}

export function CalibrationWidget({
  initialCalibration,
  coldStartActive,
  daysRemaining,
  pollIntervalMs = 60_000,
}: CalibrationWidgetProps) {
  const [serverCalibration, setServerCalibration] = useState(initialCalibration)

  const {
    calibrationActual,
    calibrationGhost,
    hasPendingFeedback,
    applyHITLAction,
    syncActual,
  } = useCalibrationGhost(serverCalibration)

  // Poll for updated calibration from the server
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/cold-start/status')
        if (!res.ok) return
        const data = await res.json()
        const newCalibration = data.calibrationSignificance ?? serverCalibration
        if (newCalibration !== serverCalibration) {
          setServerCalibration(newCalibration)
          syncActual(newCalibration)
        }
      } catch {
        // Silently ignore fetch errors during polling
      }
    }, pollIntervalMs)
    return () => clearInterval(interval)
  }, [pollIntervalMs, serverCalibration, syncActual])

  const handleApprove = useCallback(async (leadId: string) => {
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      })
      if (res.ok) {
        applyHITLAction('approve')
      }
    } catch {
      // Error handling delegated to caller
    }
  }, [applyHITLAction])

  const handleReject = useCallback(async (leadId: string, reason: string, reasonRaw?: string) => {
    try {
      const res = await fetch('/api/hitl/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          rejectReason: reason,
          rejectReasonRaw: reasonRaw,
        }),
      })
      if (res.ok) {
        applyHITLAction('reject')
      }
    } catch {
      // Error handling delegated to caller
    }
  }, [applyHITLAction])

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
      <AIConfidenceMeter
        calibrationActual={calibrationActual}
        calibrationGhost={calibrationGhost}
        hasPendingFeedback={hasPendingFeedback}
        showLabel={true}
      />

      {coldStartActive && (
        <div className="mt-3 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs text-gray-400">
            Cold-start active{daysRemaining !== null && ` — ${daysRemaining} days remaining`}
          </span>
        </div>
      )}

      {hasPendingFeedback && (
        <p className="mt-2 text-xs text-gray-500">
          Your feedback is queued. Model recalibrates nightly at 3 AM.
        </p>
      )}
    </div>
  )
}

// Re-export action handlers type for parent pages that need to wire approve/reject buttons
export type CalibrationActions = {
  handleApprove: (leadId: string) => Promise<void>
  handleReject: (leadId: string, reason: string, reasonRaw?: string) => Promise<void>
}
