import './globals.css';
import { SessionShell } from '@/components/session-shell';
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';

export const metadata: Metadata = {
  title: 'API Gateway Platform',
  description: 'Administrative control plane for API Gateway Platform.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className={GeistSans.className}><SessionShell>{children}</SessionShell></body>
    </html>
  );
}
