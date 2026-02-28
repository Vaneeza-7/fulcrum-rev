import './globals.css'
import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/nextjs'

export const metadata = {
  title: 'Fulcrum',
  description: 'Revenue Operating System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const hasClerkKey = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

  if (!hasClerkKey) {
    return (
      <html lang="en">
        <body className="font-satoshi">{children}</body>
      </html>
    )
  }

  return (
    <ClerkProvider>
      <html lang="en">
        <body className="bg-brand-bg text-brand-black font-satoshi">
          <header className="fixed top-0 left-0 right-0 z-50 bg-brand-bg/90 backdrop-blur-sm">
            <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
              <a
                href="https://fulcrumcollective.io"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5"
              >
                <svg viewBox="0 0 32 32" fill="none" className="h-7 w-7" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="16" cy="16" r="12" stroke="#27e7fe" strokeWidth="2.5" />
                  <path d="M10 16 L16 10 L22 16 L16 22 Z" fill="#27e7fe" />
                </svg>
                <span className="text-lg font-bold tracking-tight">Fulcrum</span>
              </a>

              <div className="flex items-center gap-4">
                <SignedOut>
                  <SignInButton mode="modal">
                    <button className="text-sm font-medium text-brand-black/60 hover:text-brand-black transition-colors">
                      Sign In
                    </button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button className="rounded-lg bg-brand-black px-5 py-2 text-sm font-semibold text-white hover:bg-brand-black/80 transition-colors">
                      Get Started
                    </button>
                  </SignUpButton>
                </SignedOut>
                <SignedIn>
                  <UserButton />
                </SignedIn>
              </div>
            </div>
          </header>

          <main className="pt-16">
            {children}
          </main>
        </body>
      </html>
    </ClerkProvider>
  )
}
