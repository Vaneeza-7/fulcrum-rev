'use client'
import { useCallback, type ReactNode } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { hapticApprove, hapticReject } from '@/lib/utils/haptics'

interface SwipeableLeadCardProps {
  children: ReactNode
  onApprove: () => void
  onReject: () => void
  className?: string
}

const SWIPE_THRESHOLD = 80 // px
const MAX_TILT_DEG = 12

export function SwipeableLeadCard({
  children,
  onApprove,
  onReject,
  className = '',
}: SwipeableLeadCardProps) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 0, 200], [-MAX_TILT_DEG, 0, MAX_TILT_DEG])

  // Overlay opacities
  const approveOpacity = useTransform(x, [0, SWIPE_THRESHOLD, SWIPE_THRESHOLD + 40], [0, 0.15, 0.45])
  const rejectOpacity = useTransform(x, [-SWIPE_THRESHOLD - 40, -SWIPE_THRESHOLD, 0], [0.45, 0.15, 0])

  // Label opacities
  const approveLabelOpacity = useTransform(x, [20, SWIPE_THRESHOLD], [0, 1])
  const rejectLabelOpacity = useTransform(x, [-SWIPE_THRESHOLD, -20], [1, 0])

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number } }) => {
      const swipeX = info.offset.x
      if (swipeX >= SWIPE_THRESHOLD) {
        hapticApprove()
        onApprove()
        animate(x, 500, { duration: 0.3 })
      } else if (swipeX <= -SWIPE_THRESHOLD) {
        hapticReject()
        onReject()
        animate(x, -500, { duration: 0.3 })
      } else {
        // Snap back
        animate(x, 0, { type: 'spring', stiffness: 400, damping: 25 })
      }
    },
    [onApprove, onReject, x]
  )

  return (
    <div className={`relative select-none touch-pan-y ${className}`}>
      {/* Approve overlay */}
      <motion.div
        style={{ opacity: approveOpacity }}
        className="pointer-events-none absolute inset-0 rounded-2xl bg-emerald-400"
      />
      {/* Reject overlay */}
      <motion.div
        style={{ opacity: rejectOpacity }}
        className="pointer-events-none absolute inset-0 rounded-2xl bg-rose-400"
      />

      {/* Approve label */}
      <motion.div
        style={{ opacity: approveLabelOpacity }}
        className="pointer-events-none absolute left-4 top-4 z-10 rounded-lg border-2 border-emerald-500 px-3 py-1 text-sm font-bold uppercase text-emerald-600 rotate-[-15deg]"
      >
        Approve
      </motion.div>
      {/* Reject label */}
      <motion.div
        style={{ opacity: rejectLabelOpacity }}
        className="pointer-events-none absolute right-4 top-4 z-10 rounded-lg border-2 border-rose-500 px-3 py-1 text-sm font-bold uppercase text-rose-600 rotate-[15deg]"
      >
        Reject
      </motion.div>

      {/* Draggable card */}
      <motion.div
        style={{ x, rotate }}
        drag="x"
        dragConstraints={{ left: -300, right: 300 }}
        dragElastic={0.15}
        onDragEnd={handleDragEnd}
        className="relative z-20 cursor-grab active:cursor-grabbing"
      >
        {children}
      </motion.div>
    </div>
  )
}
