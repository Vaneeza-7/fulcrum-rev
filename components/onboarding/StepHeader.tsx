interface StepHeaderProps {
  currentStep: number
  totalSteps?: number
  title: string
  description: string
}

export function StepHeader({
  currentStep,
  totalSteps = 6,
  title,
  description,
}: StepHeaderProps) {
  return (
    <>
      <div className="flex items-center gap-2 mb-6">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-full ${
              i + 1 < currentStep
                ? 'bg-brand-cyan'
                : i + 1 === currentStep
                  ? 'bg-brand-cyan/70'
                  : 'bg-gray-800'
            }`}
          />
        ))}
      </div>
      <div className="mb-2 text-sm text-brand-cyan font-medium uppercase tracking-wide">
        Step {currentStep} of {totalSteps}
      </div>
      <h1 className="text-3xl font-bold mb-2">{title}</h1>
      <p className="text-gray-400 mb-8">{description}</p>
    </>
  )
}
