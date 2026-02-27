'use client'
import { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { hapticTap } from '@/lib/utils/haptics'

export interface RejectionReason {
  id: string
  label: string
}

export const DEFAULT_REJECTION_REASONS: RejectionReason[] = [
  { id: 'wrong_industry', label: 'Wrong industry' },
  { id: 'low_budget', label: 'Budget too low' },
  { id: 'already_customer', label: 'Already a customer' },
  { id: 'not_decision_maker', label: 'Not decision maker' },
  { id: 'bad_timing', label: 'Bad timing' },
  { id: 'duplicate', label: 'Duplicate lead' },
  { id: 'other', label: 'Other' },
]

interface ReasonChipDrawerProps {
  isOpen: boolean
  reasons?: RejectionReason[]
  onConfirm: (selectedReasonIds: string[]) => void
  onCancel: () => void
}

export function ReasonChipDrawer({
  isOpen,
  reasons = DEFAULT_REJECTION_REASONS,
  onConfirm,
  onCancel,
}: ReasonChipDrawerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggleReason = useCallback((id: string) => {
    hapticTap()
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleConfirm = useCallback(() => {
    if (selected.size === 0) return
    onConfirm(Array.from(selected))
    setSelected(new Set())
  }, [selected, onConfirm])

  const handleCancel = useCallback(() => {
    setSelected(new Set())
    onCancel()
  }, [onCancel])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={handleCancel}
          />

          {/* Drawer */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-white px-6 pb-10 pt-5 shadow-2xl"
          >
            {/* Handle bar */}
            <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-gray-200" />

            <h3 className="mb-4 text-base font-semibold text-gray-900">
              Why are you rejecting this lead?
            </h3>

            {/* Chips — min-h-[48px] enforces touch target */}
            <div className="mb-6 flex flex-wrap gap-2">
              {reasons.map((reason) => {
                const isSelected = selected.has(reason.id)
                return (
                  <button
                    key={reason.id}
                    type="button"
                    onClick={() => toggleReason(reason.id)}
                    aria-pressed={isSelected}
                    className={[
                      'min-h-[48px] rounded-2xl border px-4 py-2 text-sm font-medium transition-all',
                      isSelected
                        ? 'border-rose-500 bg-rose-50 text-rose-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400',
                    ].join(' ')}
                  >
                    {reason.label}
                  </button>
                )
              })}
            </div>

            {/* Actions */}
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={handleConfirm}
              className="mb-3 w-full rounded-2xl bg-rose-500 py-3 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-50"
            >
              Confirm Rejection
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="w-full rounded-2xl border border-gray-200 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
