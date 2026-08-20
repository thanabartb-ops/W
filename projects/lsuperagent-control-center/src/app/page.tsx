export default function Home() {
  return (
    <main className="control-center-shell">
      <section className="status-panel" aria-labelledby="control-center-title">
        <p className="eyebrow">R1_SOURCE</p>
        <h1 id="control-center-title">LSUPERAGENT Control Center</h1>
        <p className="connection-status" role="status">NOT_CONNECTED</p>
        <p className="status-note">Backend connectivity is intentionally not configured in R1.</p>
      </section>
    </main>
  )
}
