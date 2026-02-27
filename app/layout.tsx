import './globals.css';

export const metadata = {
  title: 'Fulcrum',
  description: 'Revenue Operating System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
