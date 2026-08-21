import { ModulePanel } from '../../../components/module-panel'

export default function RuntimePage() {
  return <ModulePanel title="Runtime" description="UI health is available through /api/health; gateway and backend remain NOT_CONNECTED." />
}
