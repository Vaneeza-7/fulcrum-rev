'use client'
import { AnimatePresence, motion } from 'framer-motion'
import type { CleanSlateState } from '@/hooks/useCleanSlate'

interface CleanSlateModalProps {
  state: CleanSlateState
}

export function CleanSlateModal({ state }: CleanSlateModalProps) {
  const { shouldShow, cancelledCount, dismiss, confirmPurge, isPurging } = state

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={dismiss}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="relative mx-4 w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Icon */}
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-50">
              <span className="text-3xl">🧹</span>
            </div>

            {/* Headline */}
            <h2 className="mb-2 text-xl font-bold text-gray-900">You&apos;re back online.</h2>
            <p className="mb-1 text-sm text-gray-600">
              Credits restored. Fulcrum is ready to work again.
            </p>
            <p className="mb-6 text-sm text-gray-500">
              {cancelledCount} lead{cancelledCount !== 1 ? 's were' : ' was'} paused while credits
              were zero. You can clear them for a clean start, or dismiss to review them manually.
            </p>

            {/* Actions */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                disabled={isPurging}
                onClick={confirmPurge}
                className="flex-1 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-60"
              >
                {isPurging ? 'Clearing…' : 'Start Fresh — Clear Paused Leads'}
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Review Manually
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
