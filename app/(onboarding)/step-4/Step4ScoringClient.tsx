'use client'

import { useRouter } from 'next/navigation'
import { StepHeader } from '@/components/onboarding/StepHeader'
import { ScoringEditor, type ScoringConfig } from '@/components/onboarding/ScoringEditor'

interface Props {
  initialScoring: ScoringConfig
}

export function Step4ScoringClient({ initialScoring }: Props) {
  const router = useRouter()

  async function handleSave(scoring: ScoringConfig) {
    const res = await fetch('/api/onboarding/save-scoring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scoring),
    })
    if (res.ok) {
      router.push('/step-5')
    }
  }

  return (
    <>
      <StepHeader
        currentStep={4}
        title="Scoring Weights"
        description="Configure how leads are scored. The AI uses these weights to rank prospects. Formula: 40% Fit + 60% Intent."
      />
      <ScoringEditor initialScoring={initialScoring} onSave={handleSave} />
      <a href="/step-3" className="block text-center text-sm text-gray-500 mt-4 hover:text-gray-400">
        Back
      </a>
    </>
  )
}
