'use client'

import { useRouter } from 'next/navigation'
import { StepHeader } from '@/components/onboarding/StepHeader'
import { IntegrationEditor } from '@/components/onboarding/IntegrationEditor'

interface Props {
  currentCrmType?: string
  currentCrmConfig?: Record<string, string>
  hasSlack?: boolean
}

export function Step5IntegrationsClient({ currentCrmType, currentCrmConfig, hasSlack }: Props) {
  const router = useRouter()

  async function handleSave(data: {
    crmType?: string
    crmConfig?: Record<string, string>
    slack?: { teamId: string; botToken: string; channelId: string }
  }) {
    const res = await fetch('/api/onboarding/save-integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      router.push('/step-6')
    }
  }

  function handleSkip() {
    router.push('/step-6')
  }

  return (
    <>
      <StepHeader
        currentStep={5}
        title="Connect Integrations"
        description="Connect your CRM and Slack to automate lead delivery. You can skip this and configure later in Settings."
      />
      <IntegrationEditor
        currentCrmType={currentCrmType}
        currentCrmConfig={currentCrmConfig}
        hasSlack={hasSlack}
        onSave={handleSave}
        showSkip
        onSkip={handleSkip}
      />
      <a href="/step-4" className="block text-center text-sm text-gray-500 mt-4 hover:text-gray-400">
        Back
      </a>
    </>
  )
}
