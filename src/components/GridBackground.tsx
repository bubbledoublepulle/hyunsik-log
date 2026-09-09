export default function GridBackground() {
  return (
    <div
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{
        backgroundColor: 'var(--bg-blue)',
        backgroundSize: '60px 60px',
        backgroundImage: `
          linear-gradient(to right, var(--grid-color) 1px, transparent 1px),
          linear-gradient(to bottom, var(--grid-color) 1px, transparent 1px)
        `,
        maskImage: 'radial-gradient(circle at center, black 60%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(circle at center, black 60%, transparent 100%)',
      }}
    />
  );
}
