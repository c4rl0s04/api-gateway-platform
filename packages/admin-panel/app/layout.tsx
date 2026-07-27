import './globals.css';
import { SessionShell } from '@/components/session-shell';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body><SessionShell>{children}</SessionShell></body>
    </html>
  )
}
