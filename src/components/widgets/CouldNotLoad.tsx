/**
 * The quiet placeholder every data-driven widget shows when its source fails.
 * Per docs/architecture.md §6 → Resilience: "render a quiet placeholder,
 * the page still paints."
 */
export function CouldNotLoad() {
  return (
    <div
      style={{
        fontSize: '11px',
        color: 'var(--text-dim)',
        fontFamily: 'var(--font-plex-mono), monospace',
        letterSpacing: '0.5px',
        padding: '4px 0',
      }}
    >
      could not load
    </div>
  );
}
