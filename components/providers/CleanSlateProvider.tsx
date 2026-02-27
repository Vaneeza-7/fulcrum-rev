'use client'

import { useCleanSlate } from '@/hooks/useCleanSlate'
import { CleanSlateModal } from '@/components/modals/CleanSlateModal'

interface CleanSlateProviderProps {
  cancelledCount: number
  creditBalance: number
  children: React.ReactNode
}

/**
 * Wraps the dashboard tree and renders the CleanSlateModal overlay
 * when (a) credit balance is restored and (b) there are paused leads.
 *
 * Mount once in the dashboard layout — the modal uses a localStorage
 * guard so it only fires once per session.
 */
export function CleanSlateProvider({
  cancelledCount,
  creditBalance,
  children,
}: CleanSlateProviderProps) {
  const cleanSlateState = useCleanSlate(cancelledCount, creditBalance)

  return (
    <>
      {children}
      <CleanSlateModal state={cleanSlateState} />
    </>
  )
}
