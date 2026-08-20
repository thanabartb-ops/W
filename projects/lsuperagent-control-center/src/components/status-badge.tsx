import type { ConnectionStatus } from '../types/connection-status'

export function StatusBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`} role="status">
      {status}
    </span>
  )
}
