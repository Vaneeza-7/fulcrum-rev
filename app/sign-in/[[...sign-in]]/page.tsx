import { SignIn } from '@clerk/nextjs'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Fulcrum — Sign In',
  description: 'Sign in to Fulcrum',
}

export default function SignInPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-brand-bg px-6 py-12">
      <div className="mx-auto flex max-w-5xl items-center justify-center">
        <div className="w-full max-w-md">
          <SignIn
            routing="hash"
            signUpUrl="/sign-up"
            fallbackRedirectUrl="/"
            forceRedirectUrl="/"
          />
        </div>
      </div>
    </div>
  )
}
