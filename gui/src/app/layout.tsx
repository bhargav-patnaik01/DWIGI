import type { Metadata, Viewport } from 'next';
import { AppShell } from '@/components/layout/AppShell';
import './globals.css';

export const metadata: Metadata = {
  title: "Don't Worry I Got It - D.W.I.G.I",
  description: 'D.W.I.G.I — an AI executive council for founders who decide alone.',
};

export const viewport: Viewport = {
  // Desktop chrome: no pinch-zoom, no accidental scaling.
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `data-theme` is set to dark here so the very first paint is already dark,
    // before AppShell's effect runs. Prevents a light flash on cold start.
    <html lang="en" data-theme="dark" style={{ colorScheme: 'dark' }}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
