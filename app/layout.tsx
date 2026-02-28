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
        <body>{children}</body>
      </html>
    )
  }

  return (
    <ClerkProvider>
      <html lang="en">
        <body className="bg-white text-gray-900">
          <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-100">
            <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
              <a
                href="https://fulcrumcollective.io"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <svg viewBox="0 0 32 32" fill="none" className="h-8 w-8" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="16" cy="16" r="12" stroke="#0891b2" strokeWidth="2.5" />
                  <path d="M10 16 L16 10 L22 16 L16 22 Z" fill="#0891b2" />
                </svg>
                <span className="text-lg font-bold text-gray-900">Fulcrum</span>
              </a>

              <div className="flex items-center gap-3">
                <SignedOut>
                  <SignInButton mode="modal">
                    <button className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                      Sign In
                    </button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 transition-colors">
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
