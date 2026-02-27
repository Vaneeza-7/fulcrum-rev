// hooks/useCalibrationGhost.ts
'use client'

import { useState, useEffect, useCallback } from 'react'

export interface CalibrationGhostState {
  calibrationActual: number
  calibrationGhost: number
  ghostOffset: number
  hasPendingFeedback: boolean
  applyHITLAction: (action: 'approve' | 'reject') => void
  syncActual: (newActual: number) => void
}

const MAX_GHOST_OFFSET = 0.10
const GHOST_DELTA_PER_ACTION = 0.007
const GHOST_OFFSET_KEY = 'fulcrum_calibration_ghost_offset'

export function useCalibrationGhost(actualFromServer: number): CalibrationGhostState {
  const [calibrationActual, setCalibrationActual] = useState<number>(actualFromServer)
  const [ghostOffset, setGhostOffset] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const stored = sessionStorage.getItem(GHOST_OFFSET_KEY)
    return stored ? parseFloat(stored) : 0
  })

  useEffect(() => {
    // Snap ghost back to actual when server returns fresh calibration (post-cron)
    setCalibrationActual(actualFromServer)
    setGhostOffset(0)
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(GHOST_OFFSET_KEY)
    }
  }, [actualFromServer])

  const calibrationGhost = Math.min(
    calibrationActual + ghostOffset,
    calibrationActual + MAX_GHOST_OFFSET,
    1.0
  )

  const applyHITLAction = useCallback((_action: 'approve' | 'reject') => {
    setGhostOffset(prev => {
      const next = Math.min(prev + GHOST_DELTA_PER_ACTION, MAX_GHOST_OFFSET)
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(GHOST_OFFSET_KEY, String(next))
      }
      return next
    })
  }, [])

  const syncActual = useCallback((newActual: number) => {
    setCalibrationActual(newActual)
    setGhostOffset(0)
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(GHOST_OFFSET_KEY)
    }
  }, [])

  return {
    calibrationActual,
    calibrationGhost,
    ghostOffset,
    hasPendingFeedback: ghostOffset > 0,
    applyHITLAction,
    syncActual,
  }
}
