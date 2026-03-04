// app/(onboarding)/step-6/Step6CalibrationClient.tsx
'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useCalibrationGhost } from '@/hooks/useCalibrationGhost'
import { AIConfidenceMeter } from '@/components/ui/AIConfidenceMeter'
import { StepHeader } from '@/components/onboarding/StepHeader'
import { SwipeableLeadCard } from '@/components/hitl/SwipeableLeadCard'
import { ReasonChipDrawer } from '@/components/hitl/ReasonChipDrawer'

const CHIP_TO_REJECT_REASON: Record<string, string> = {
  wrong_industry: 'WRONG_ICP',
  low_budget: 'OTHER',
  already_customer: 'ALREADY_CUSTOMER',
  not_decision_maker: 'OTHER',
  bad_timing: 'BAD_TIMING',
  duplicate: 'OTHER',
  other: 'OTHER',
}

interface Lead {
  id: string
  fullName: string
  title: string
  company: string
  fulcrumScore: number
  fulcrumGrade: string
  fitScore: number
  intentScore: number
  firstLine: string
  linkedinUrl: string
}

interface Step6CalibrationClientProps {
  initialCalibration: number
  coldStartActive: boolean
  daysRemaining: number | null
  leads: Lead[]
}

export function Step6CalibrationClient({
  initialCalibration,
  coldStartActive,
  daysRemaining,
  leads: initialLeads,
}: Step6CalibrationClientProps) {
  const [leads, setLeads] = useState(initialLeads)
  const [actionsCount, setActionsCount] = useState(0)
  const [pendingRejectLeadId, setPendingRejectLeadId] = useState<string | null>(null)

  const {
    calibrationActual,
    calibrationGhost,
    hasPendingFeedback,
    applyHITLAction,
  } = useCalibrationGhost(initialCalibration)

  const handleApprove = useCallback(async (leadId: string) => {
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      })
      if (res.ok) {
        applyHITLAction('approve')
        setLeads((prev) => prev.filter((l) => l.id !== leadId))
        setActionsCount((c) => c + 1)
      }
    } catch {
      // Silently handle
    }
  }, [applyHITLAction])

  const handleRejectWithReasons = useCallback(async (reasonIds: string[]) => {
    if (!pendingRejectLeadId) return
    const primaryReason = CHIP_TO_REJECT_REASON[reasonIds[0]] ?? 'OTHER'
    try {
      const res = await fetch(`/api/leads/${pendingRejectLeadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'rejected',
          rejectReason: primaryReason,
          rejectionReason: reasonIds.join(', '),
        }),
      })
      if (res.ok) {
        applyHITLAction('reject')
        setLeads((prev) => prev.filter((l) => l.id !== pendingRejectLeadId))
        setActionsCount((c) => c + 1)
      }
    } catch {
      // Silently handle
    } finally {
      setPendingRejectLeadId(null)
    }
  }, [pendingRejectLeadId, applyHITLAction])

  return (
    <>
      <StepHeader
        currentStep={6}
        title="AI Calibration"
        description="Fulcrum learns from your approvals and rejections. Review a few leads below to start teaching the model your preferences."
      />

        {/* Confidence Meter */}
        <div className="mb-10">
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
                Cold-start active{daysRemaining !== null && ` — ${daysRemaining} days remaining`}.
                All leads require manual approval during this period.
              </span>
            </div>
          )}

          {actionsCount > 0 && (
            <p className="mt-2 text-xs text-gray-500">
              {actionsCount} action{actionsCount !== 1 ? 's' : ''} taken — ghost bar shows projected calibration improvement.
            </p>
          )}
        </div>

        {/* Lead Review Cards */}
        {leads.length > 0 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-200">Review These Leads</h2>
            {leads.map((lead) => (
              <SwipeableLeadCard
                key={lead.id}
                onApprove={() => handleApprove(lead.id)}
                onReject={() => setPendingRejectLeadId(lead.id)}
              >
                <div className="rounded-lg bg-gray-900 border border-gray-800 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-white">{lead.fullName}</p>
                      <p className="text-sm text-gray-400">
                        {lead.title} at {lead.company}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-brand-cyan">
                        {lead.fulcrumScore}
                      </span>
                      <span className="ml-1 text-sm text-gray-500">
                        ({lead.fulcrumGrade})
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 mb-2">
                    Fit: {lead.fitScore}/40 | Intent: {lead.intentScore}/60
                  </div>

                  {lead.firstLine && (
                    <p className="text-sm text-gray-300 italic mb-3">
                      &ldquo;{lead.firstLine}&rdquo;
                    </p>
                  )}

                  <div className="hidden md:flex gap-2">
                    <button
                      onClick={() => handleApprove(lead.id)}
                      className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setPendingRejectLeadId(lead.id)}
                      className="rounded-md bg-red-600/20 border border-red-600/40 px-4 py-1.5 text-sm font-medium text-red-400 hover:bg-red-600/30 transition-colors"
                    >
                      Reject
                    </button>
                    <a
                      href={lead.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md bg-gray-800 px-4 py-1.5 text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors"
                    >
                      LinkedIn
                    </a>
                  </div>
                </div>
              </SwipeableLeadCard>
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-gray-900 border border-gray-800 p-8 text-center">
            <p className="text-gray-400">
              {actionsCount > 0
                ? 'All leads reviewed! Your feedback will be applied in the next calibration cycle.'
                : 'No leads awaiting review yet. Once the pipeline runs, leads will appear here.'}
            </p>
          </div>
        )}

        {/* Continue button */}
        <div className="mt-10 flex justify-end">
          <Link
            href="/"
            className="rounded-lg bg-brand-cyan px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-cyan/80 transition-colors"
          >
            Continue to Dashboard →
          </Link>
        </div>

        <Link href="/step-5" className="block text-center text-sm text-gray-500 mt-4 hover:text-gray-400">
          Back
        </Link>

      {/* Rejection reason drawer */}
      <ReasonChipDrawer
        isOpen={pendingRejectLeadId !== null}
        onConfirm={handleRejectWithReasons}
        onCancel={() => setPendingRejectLeadId(null)}
      />
    </>
  )
}
