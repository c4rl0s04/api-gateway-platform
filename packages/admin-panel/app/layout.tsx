import './globals.css';
import { SessionShell } from '@/components/session-shell';
import { SidebarPreferenceScript } from '@/components/sidebar-preference-script';
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';

export const metadata: Metadata = {
  title: {
    default: 'Gateway Control',
    template: '%s · Gateway Control',
  },
  description: 'Inspect gateway routing, policy, identity, and certificate trust from one control plane.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body
        className={GeistSans.className}
        data-design-contract="request-path-770149a6"
        data-design-thesis="A request path is the portal's organizing structure; it refuses the generic metric-card dashboard."
        data-design-own-world="Warm matte planes, deep vermilion rails, circular route nodes, 1px warm rules, Geist Sans, and metadata-only Geist Mono."
        data-design-story="Operators see how traffic crosses identity, edge, policy, and upstream boundaries, then open the control attached to each stage."
        data-design-first-viewport="A compact left rail frames a large routing headline and a four-stage horizontal request path; Login mirrors it with a trust rail and one OIDC action."
        data-design-form="Approved horizontal request path, selected direction A, seed request-path-770149a6."
        data-design-finish="unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md"
      >
        <SidebarPreferenceScript />
        <SessionShell>{children}</SessionShell>
      </body>
    </html>
  );
}
