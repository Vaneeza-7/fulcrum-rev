'use client'

import { useRouter } from 'next/navigation'
import { StepHeader } from '@/components/onboarding/StepHeader'
import { KeywordEditor, type IntentKeyword } from '@/components/onboarding/KeywordEditor'

interface Props {
  initialKeywords: IntentKeyword[]
}

export function Step3KeywordsClient({ initialKeywords }: Props) {
  const router = useRouter()

  async function handleSave(keywords: IntentKeyword[]) {
    const res = await fetch('/api/onboarding/save-keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords }),
    })
    if (res.ok) {
      router.push('/step-4')
    }
  }

  return (
    <>
      <StepHeader
        currentStep={3}
        title="Intent Keywords"
        description="Define the signals that indicate buying intent. Higher scores mean stronger signals."
      />
      <KeywordEditor initialKeywords={initialKeywords} onSave={handleSave} />
      <a href="/step-2" className="block text-center text-sm text-gray-500 mt-4 hover:text-gray-400">
        Back
      </a>
    </>
  )
}
