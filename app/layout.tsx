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
        <body>
          <header className="flex items-center gap-4 p-4">
            <SignedOut>
              <SignInButton />
              <SignUpButton />
            </SignedOut>
            <SignedIn>
              <UserButton />
            </SignedIn>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
