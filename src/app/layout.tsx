import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import '@/styles/theme.css';
import '@/styles/widgets.css';

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

/**
 * No-flash font-size script — runs before React boots, applies the user's
 * stored --page-font-size from localStorage. Without this, the first paint is
 * at the default 13px and snaps to e.g. 17px on hydrate. With it, the very
 * first paint uses the chosen size. (#51 — StatusBar A−/A+ controls.)
 */
const FONT_SIZE_BOOTSTRAP = `(function(){try{var s=localStorage.getItem('frontdoor.fontSize');if(s&&['11','13','15','17'].indexOf(s)>=0)document.documentElement.style.setProperty('--page-font-size',s+'px')}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning on <html>: the no-flash bootstrap script below
    // intentionally mutates documentElement.style.--page-font-size BEFORE
    // React hydrates, so server/client markup diverges by design. Standard
    // React pattern for pre-hydration DOM tweaks (themes, locale, etc.).
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: FONT_SIZE_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
