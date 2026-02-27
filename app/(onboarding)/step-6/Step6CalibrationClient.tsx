// app/(onboarding)/step-6/Step6CalibrationClient.tsx
'use client'

import { useState, useCallback } from 'react'
import { useCalibrationGhost } from '@/hooks/useCalibrationGhost'
import { AIConfidenceMeter } from '@/components/ui/AIConfidenceMeter'
import { SwipeableLeadCard } from '@/components/hitl/SwipeableLeadCard'
import { ReasonChipDrawer } from '@/components/hitl/ReasonChipDrawer'

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

  // Map chip IDs to the NegativeReason enum values the API expects
  const chipToRejectReason: Record<string, string> = {
    wrong_industry: 'WRONG_ICP',
    low_budget: 'OTHER',
    already_customer: 'ALREADY_CUSTOMER',
    not_decision_maker: 'OTHER',
    bad_timing: 'BAD_TIMING',
    duplicate: 'OTHER',
    other: 'OTHER',
  }

  const handleRejectWithReasons = useCallback(async (reasonIds: string[]) => {
    if (!pendingRejectLeadId) return
    const primaryReason = chipToRejectReason[reasonIds[0]] ?? 'OTHER'
    try {
      const res = await fetch('/api/hitl/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: pendingRejectLeadId,
          rejectReason: primaryReason,
          rejectReasonRaw: reasonIds.join(', '),
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
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-2xl px-6 py-16">
        {/* Header */}
        <div className="mb-2 text-sm text-cyan-400 font-medium uppercase tracking-wide">
          Step 6 of 6
        </div>
        <h1 className="text-3xl font-bold mb-2">AI Calibration</h1>
        <p className="text-gray-400 mb-8">
          Fulcrum learns from your approvals and rejections. Review a few leads below to start
          teaching the model your preferences.
        </p>

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
                      <span className="text-lg font-bold text-cyan-400">
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
          <a
            href="/dashboard"
            className="rounded-lg bg-cyan-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 transition-colors"
          >
            Continue to Dashboard →
          </a>
        </div>
      </div>

      {/* Rejection reason drawer */}
      <ReasonChipDrawer
        isOpen={pendingRejectLeadId !== null}
        onConfirm={handleRejectWithReasons}
        onCancel={() => setPendingRejectLeadId(null)}
      />
    </div>
  )
}
