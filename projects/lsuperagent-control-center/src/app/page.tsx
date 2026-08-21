import Link from 'next/link'

const shortcuts = [
  { label: 'Create Image', note: 'Generate visuals', href: '/tools', icon: '⌁', tone: 'pink' },
  { label: 'Create Sticker', note: 'Make sticker packs', href: '/tools', icon: '◫', tone: 'blue' },
  { label: 'Research', note: 'Search deeply', href: '/projects', icon: '⌕', tone: 'blue' },
  { label: 'Agents', note: 'Specialist AI team', href: '/runtime', icon: '◎', tone: 'violet' },
] as const

const nav = [
  { label: 'Home', href: '/', icon: '⌂', active: true },
  { label: 'Chat', href: '/chat', icon: '◯', active: false },
  { label: 'Create', href: '/tools', icon: '✧', active: false },
  { label: 'Agents', href: '/runtime', icon: '◉', active: false },
  { label: 'Me', href: '/memory', icon: '♙', active: false },
] as const

export default function Home() {
  return (
    <main className="mobile-home-shell">
      <section className="mobile-home" aria-labelledby="lsuperagent-title">
        <header className="home-header">
          <div>
            <h1 id="lsuperagent-title" className="brand-wordmark">LSUPERAGENT</h1>
            <p className="brand-tagline">Your AI. Your rules.</p>
          </div>
          <div className="profile-avatar" aria-label="Profile" />
        </header>

        <section className="hero-stage" aria-label="LSUPERAGENT companion">
          <div className="hero-art" role="img" aria-label="SERREZ, LSUPERAGENT companion" />
          <div className="hero-copy">
            <p className="hero-kicker">Hey, I’m L. <span aria-hidden="true">♡</span></p>
            <p>Your personal AI partner</p>
            <p>What shall we create together today?</p>
          </div>
        </section>

        <form className="command-bar" action="/chat" method="get" role="search">
          <span className="command-search" aria-hidden="true">⌕</span>
          <input name="q" aria-label="Ask LSUPERAGENT" placeholder="Ask LSUPERAGENT anything..." autoComplete="off" />
          <button type="submit" aria-label="Send to LSUPERAGENT">✦</button>
        </form>

        <section className="shortcut-grid" aria-label="Quick actions">
          {shortcuts.map((item) => (
            <Link key={item.label} href={item.href} className={`shortcut-card ${item.tone}`}>
              <span className="shortcut-icon" aria-hidden="true">{item.icon}</span>
              <span className="shortcut-copy">
                <strong>{item.label}</strong>
                <span>{item.note}</span>
              </span>
              <span className="shortcut-chevron" aria-hidden="true">›</span>
            </Link>
          ))}
        </section>

        <nav className="bottom-nav" aria-label="Primary navigation">
          {nav.map((item) => (
            <Link key={item.label} href={item.href} className={item.active ? 'nav-item active' : 'nav-item'} aria-current={item.active ? 'page' : undefined}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </section>
    </main>
  )
}
