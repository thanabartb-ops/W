import { StatusBadge } from './status-badge'

export function ModulePanel({ title, description }: { title: string; description: string }) {
  return (
    <section className="module-panel">
      <div>
        <p className="eyebrow">MODULE</p>
        <h1>{title}</h1>
      </div>
      <StatusBadge status="NOT_CONNECTED" />
      <p className="module-description">{description}</p>
    </section>
  )
}
