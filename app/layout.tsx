import './globals.css'
import { ClerkProvider } from '@clerk/nextjs'

export const metadata = {
  title: 'Fulcrum',
  description: 'Revenue Operating System',
}

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const content = (
    <html lang="en">
      <body>{children}</body>
    </html>
  )

  if (!clerkKey) return content

  return <ClerkProvider>{content}</ClerkProvider>
}
