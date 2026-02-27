'use client'
import { useState, useEffect, useCallback } from 'react'

const CLEAN_SLATE_SHOWN_KEY = 'fulcrum_clean_slate_shown'

export interface CleanSlateState {
  shouldShow: boolean
  cancelledCount: number
  dismiss: () => void
  confirmPurge: () => Promise<void>
  isPurging: boolean
}

export function useCleanSlate(cancelledCount: number, creditBalance: number): CleanSlateState {
  const [shouldShow, setShouldShow] = useState(false)
  const [isPurging, setIsPurging] = useState(false)

  useEffect(() => {
    if (creditBalance <= 0) return
    if (cancelledCount === 0) return
    const alreadyShown = localStorage.getItem(CLEAN_SLATE_SHOWN_KEY)
    if (!alreadyShown) {
      setShouldShow(true)
    }
  }, [creditBalance, cancelledCount])

  const dismiss = useCallback(() => {
    setShouldShow(false)
    localStorage.setItem(CLEAN_SLATE_SHOWN_KEY, '1')
  }, [])

  const confirmPurge = useCallback(async () => {
    setIsPurging(true)
    try {
      await fetch('/api/queue/purge-creditzero', { method: 'POST' })
      setShouldShow(false)
      localStorage.setItem(CLEAN_SLATE_SHOWN_KEY, '1')
    } catch (err) {
      console.error('Purge failed:', err)
    } finally {
      setIsPurging(false)
    }
  }, [])

  return { shouldShow, cancelledCount, dismiss, confirmPurge, isPurging }
}
