'use client'

import { useRouter } from 'next/navigation'
import { StepHeader } from '@/components/onboarding/StepHeader'
import { QueryEditor, type SearchQuery } from '@/components/onboarding/QueryEditor'

interface Props {
  initialQueries: SearchQuery[]
}

export function Step2QueriesClient({ initialQueries }: Props) {
  const router = useRouter()

  async function handleSave(queries: SearchQuery[]) {
    const res = await fetch('/api/onboarding/save-queries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries }),
    })
    if (res.ok) {
      router.push('/step-3')
    }
  }

  return (
    <>
      <StepHeader
        currentStep={2}
        title="Define Your ICP"
        description="Set up LinkedIn search queries to find your ideal prospects. These drive the pipeline's lead discovery."
      />
      <QueryEditor initialQueries={initialQueries} onSave={handleSave} />
      <a href="/step-1" className="block text-center text-sm text-gray-500 mt-4 hover:text-gray-400">
        Back
      </a>
    </>
  )
}
