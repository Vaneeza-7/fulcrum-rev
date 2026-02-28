'use client'

import { useState } from 'react'

interface Lead {
  id: string
  fullName: string
  title: string | null
  company: string | null
  location: string | null
  fulcrumScore: number
  fulcrumGrade: string | null
  fitScore: number
  intentScore: number
  status: string
  firstLine: string | null
  linkedinUrl: string
  discoveredAt: string
}

interface LeadsClientProps {
  initialLeads: Lead[]
  statusCounts: Record<string, number>
}

const STATUS_LABELS: Record<string, string> = {
  discovered: 'Discovered',
  pending_review: 'Pending Review',
  awaiting_approval: 'Awaiting Approval',
  approved: 'Approved',
  pushed_to_crm: 'Pushed to CRM',
  rejected: 'Rejected',
}

const STATUS_COLORS: Record<string, string> = {
  discovered: 'bg-gray-700 text-gray-300',
  pending_review: 'bg-amber-600/20 text-amber-400',
  awaiting_approval: 'bg-amber-600/20 text-amber-400',
  approved: 'bg-emerald-600/20 text-emerald-400',
  pushed_to_crm: 'bg-emerald-600/20 text-emerald-400',
  rejected: 'bg-red-600/20 text-red-400',
}

export function LeadsClient({ initialLeads, statusCounts }: LeadsClientProps) {
  const [leads, setLeads] = useState(initialLeads)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [gradeFilter, setGradeFilter] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const totalCount = Object.values(statusCounts).reduce((a, b) => a + b, 0)

  const filtered = leads.filter((l) => {
    if (statusFilter && l.status !== statusFilter) return false
    if (gradeFilter && l.fulcrumGrade !== gradeFilter) return false
    return true
  })

  async function handleApprove(leadId: string) {
    const res = await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    })
    if (res.ok) {
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: 'approved' } : l))
      )
    }
  }

  async function handleReject(leadId: string) {
    const res = await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected', rejectionReason: 'MANUAL_REJECT' }),
    })
    if (res.ok) {
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: 'rejected' } : l))
      )
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-bold mb-1">Leads</h1>
        <p className="text-sm text-gray-400 mb-6">{totalCount} total leads</p>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setStatusFilter(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              !statusFilter
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            All
          </button>
          {Object.entries(STATUS_LABELS).map(([key, label]) => {
            const count = statusCounts[key] ?? 0
            if (count === 0) return null
            return (
              <button
                key={key}
                onClick={() => setStatusFilter(statusFilter === key ? null : key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  statusFilter === key
                    ? 'bg-cyan-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {label} ({count})
              </button>
            )
          })}
        </div>

        <div className="flex gap-2 mb-6">
          {['A+', 'A', 'B', 'C', 'D'].map((grade) => (
            <button
              key={grade}
              onClick={() => setGradeFilter(gradeFilter === grade ? null : grade)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                gradeFilter === grade
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {grade}
            </button>
          ))}
        </div>

        {/* Lead List */}
        <div className="space-y-2">
          {filtered.length > 0 ? (
            filtered.map((lead) => (
              <div key={lead.id} className="rounded-xl bg-gray-900 border border-gray-800">
                <button
                  onClick={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{lead.fullName}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {lead.title} at {lead.company}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <span className="text-sm font-semibold text-cyan-400">
                      {lead.fulcrumScore}
                    </span>
                    <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-300">
                      {lead.fulcrumGrade}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        STATUS_COLORS[lead.status] ?? 'bg-gray-700 text-gray-300'
                      }`}
                    >
                      {lead.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </button>

                {expandedId === lead.id && (
                  <div className="px-4 pb-4 border-t border-gray-800 pt-3 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-xs text-gray-500">Fit Score</div>
                        <div className="text-white">{lead.fitScore}/40</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Intent Score</div>
                        <div className="text-white">{lead.intentScore}/60</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Location</div>
                        <div className="text-white">{lead.location ?? 'Unknown'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Discovered</div>
                        <div className="text-white">
                          {new Date(lead.discoveredAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    {lead.firstLine && (
                      <p className="text-sm text-gray-300 italic">
                        &ldquo;{lead.firstLine}&rdquo;
                      </p>
                    )}

                    <div className="flex gap-2">
                      {(lead.status === 'pending_review' ||
                        lead.status === 'awaiting_approval') && (
                        <>
                          <button
                            onClick={() => handleApprove(lead.id)}
                            className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(lead.id)}
                            className="rounded-md bg-red-600/20 border border-red-600/40 px-4 py-1.5 text-sm font-medium text-red-400 hover:bg-red-600/30 transition-colors"
                          >
                            Reject
                          </button>
                        </>
                      )}
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
                )}
              </div>
            ))
          ) : (
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-8 text-center">
              <p className="text-gray-400">
                {totalCount === 0
                  ? 'No leads yet. The pipeline runs Mon-Fri at 5 AM EST.'
                  : 'No leads match the current filters.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
