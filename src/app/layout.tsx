import type { Metadata } from 'next';
import './globals.css';

// Note: IBM Plex Sans/Mono via next/font is set up in #4 (theme port).
// The scaffold ships with system-font fallback so the placeholder renders without
// pulling fonts.

export const metadata: Metadata = {
  title: 'frontdoor',
  description: 'A browser start page that respects your attention.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
