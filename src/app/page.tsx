/**
 * Root route — placeholder using the ported theme classes so the panel system
 * is visibly correct before any widgets land. Real MVP entry is /d/[slug] (#23);
 * the "enter your key" page also lives here (#20). Both replace this.
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
            <span className="tagline">scaffold</span>
          </div>
          <div>
            <div className="clock">00:00</div>
            <div className="clock-date">awaiting widgets</div>
          </div>
        </header>
        <div className="grid">
          <div className="panel panel--cyan panel--span-4">
            <div className="panel-header">
              <div className="panel-icon">✦</div>
              <div className="panel-title">scaffold</div>
            </div>
            <h1 style={{ fontWeight: 400, fontSize: '14px', marginBottom: '4px' }}>frontdoor</h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              theme ported · awaiting widgets · the real dashboard renders at{' '}
              <code style={{ fontFamily: 'var(--font-plex-mono)' }}>/d/[slug]</code> (#23)
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
