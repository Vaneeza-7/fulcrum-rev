import { SignUp } from '@clerk/nextjs'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Fulcrum — Sign Up',
  description: 'Create your Fulcrum account',
}

export default function SignUpPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-brand-bg px-6 py-12">
      <div className="mx-auto flex max-w-5xl items-center justify-center">
        <div className="w-full max-w-md">
          <SignUp
            routing="hash"
            signInUrl="/sign-in"
            fallbackRedirectUrl="/"
            forceRedirectUrl="/"
          />
        </div>
      </div>
    </div>
  )
}
