/**
 * Root route — placeholder for the scaffold.
 *
 * The real entry point in MVP is /d/[slug] (per-user ISR page; see #23).
 * For unauthenticated visitors, the "enter your key" page lives here (see #20).
 */
export default function Home() {
  return (
    <main
      style={{
        display: 'flex',
        minHeight: '100vh',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        fontFamily: 'system-ui, sans-serif',
        color: '#d0dce8',
        background: '#0a0e17',
      }}
    >
      <h1 style={{ fontWeight: 300, letterSpacing: '0.05em', fontSize: '1.5rem' }}>frontdoor</h1>
      <p style={{ marginTop: '1rem', color: '#56687d', fontSize: '0.875rem' }}>
        scaffold ready · awaiting widgets
      </p>
    </main>
  );
}
