import Link from 'next/link'
import type { ReactNode } from 'react'
import { StatusBadge } from './status-badge'

const modules = [
  ['Chat', '/chat'],
  ['Projects', '/projects'],
  ['Memory', '/memory'],
  ['Tools', '/tools'],
  ['Runtime', '/runtime'],
  ['Audit', '/audit'],
] as const

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Control Center navigation">
        <div className="app-brand">
          <span className="eyebrow">LSUPERAGENT</span>
          <strong>Control Center</strong>
          <StatusBadge status="NOT_CONNECTED" />
        </div>
        <nav className="module-nav">
          {modules.map(([label, href]) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
        </nav>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  )
}
