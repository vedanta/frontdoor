/**
 * Landing / "enter your key" page.
 *
 * - Users with a valid cookie: middleware doesn't redirect them here
 *   (they'd be at /d/{slug} already). They only see this if they signed out
 *   or their cookie was invalidated.
 * - Users without a cookie: a tiny form to paste their key (or visit
 *   `/?key=…` directly from their email — middleware handles that on entry).
 *
 * The form is a plain GET → `/?key=…`. Middleware intercepts the bootstrap
 * and redirects to `/d/{slug}` with a signed cookie.
 */

export default function Home() {
  return (
    <>
      <div className="grid-dots" />
      <div className="shell">
        <header className="header">
          <div className="header-left">
            <span className="logo">
              frontdoor
              <span className="logo-dot" />
            </span>
            <span className="tagline">a browser start page that respects your attention</span>
          </div>
        </header>

        <main
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            maxWidth: '480px',
            margin: '48px auto',
            padding: '32px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
          }}
        >
          <div>
            <h1 style={{ fontWeight: 300, fontSize: '18px', marginBottom: '8px' }}>
              enter your key
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
              Paste the key from your email, or open the link directly.
            </p>
          </div>

          <form method="get" action="/" style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              name="key"
              placeholder="your key"
              autoFocus
              spellCheck={false}
              style={{
                flex: 1,
                padding: '10px 14px',
                background: 'var(--bg-deep)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-plex-mono), monospace',
                fontSize: '13px',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              style={{
                padding: '10px 18px',
                background: 'transparent',
                border: '1px solid var(--accent-cyan)',
                borderRadius: '6px',
                color: 'var(--accent-cyan)',
                fontFamily: 'var(--font-plex-mono), monospace',
                fontSize: '12px',
                letterSpacing: '1px',
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              Open
            </button>
          </form>

          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-plex-mono), monospace',
              letterSpacing: '0.5px',
              borderTop: '1px solid var(--border)',
              paddingTop: '16px',
              lineHeight: 1.7,
            }}
          >
            <div style={{ marginBottom: '6px' }}>no key yet?</div>
            <code
              style={{
                display: 'block',
                background: 'var(--bg-deep)',
                padding: '8px 10px',
                borderRadius: '4px',
                color: 'var(--text-secondary)',
                wordBreak: 'break-all',
              }}
            >
              curl -X POST /api/keys -H &apos;content-type: application/json&apos; -d &apos;{`{`}
              &quot;email&quot;:&quot;you@example.com&quot;{`}`}&apos;
            </code>
          </div>
        </main>
      </div>
    </>
  );
}
