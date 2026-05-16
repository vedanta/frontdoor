import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import '@/styles/theme.css';

// Self-hosted via next/font (replaces the @import url(...Google Fonts...) at the
// top of design/theme.css). Exposed as CSS variables so theme.css can reference
// them without literal font-family strings.
const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  display: 'swap',
});

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
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
