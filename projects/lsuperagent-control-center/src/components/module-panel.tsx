import { StatusBadge } from './status-badge'
import type { ConnectionStatus } from '../types/connection-status'

export function ModulePanel({
  title,
  description,
  status = 'NOT_CONNECTED',
}: {
  title: string
  description: string
  status?: ConnectionStatus
}) {
  return (
    <section className="module-panel">
      <div>
        <p className="eyebrow">MODULE</p>
        <h1>{title}</h1>
      </div>
      <StatusBadge status={status} />
      <p className="module-description">{description}</p>
    </section>
  )
}
