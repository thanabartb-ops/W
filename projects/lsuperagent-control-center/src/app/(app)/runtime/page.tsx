'use client'

import { useEffect, useState } from 'react'
import { ModulePanel } from '../../../components/module-panel'
import type { ConnectionStatus } from '../../../types/connection-status'

type HealthPayload = {
  gateway?: string
  backend?: string
  runtimeVersion?: string
  provider?: string
}

type RuntimeView = { status: ConnectionStatus; description: string }

const CHECKING: RuntimeView = {
  status: 'NOT_CONNECTED',
  description: 'Reading runtime status from /api/health.',
}

/**
 * The badge reported NOT_CONNECTED unconditionally, so it stayed wrong once the
 * gateway and runtime came up. DEGRADED is the honest state when exactly one
 * side answers: claiming CONNECTED there would overstate what was verified.
 */
function toView(payload: HealthPayload): RuntimeView {
  const gateway = payload.gateway === 'CONNECTED'
  const backend = payload.backend === 'CONNECTED'

  if (gateway && backend) {
    const runtime = payload.runtimeVersion ?? 'unknown'
    const provider = payload.provider ?? 'unknown'
    return {
      status: 'CONNECTED',
      description: `Gateway connected. Runtime ${runtime} reporting provider ${provider}.`,
    }
  }

  if (gateway !== backend) {
    return {
      status: 'DEGRADED',
      description: gateway
        ? 'Gateway is configured, but the canonical runtime is not answering.'
        : 'The canonical runtime is answering, but this gateway is not configured.',
    }
  }

  return {
    status: 'NOT_CONNECTED',
    description: 'Neither the gateway nor the canonical runtime is connected.',
  }
}

export default function RuntimePage() {
  const [view, setView] = useState<RuntimeView>(CHECKING)

  useEffect(() => {
    let active = true

    fetch('/api/health', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: HealthPayload | null) => {
        if (!active) return
        // A health endpoint that cannot be read is not evidence of connectivity.
        setView(payload ? toView(payload) : toView({}))
      })
      .catch(() => {
        if (active) setView(toView({}))
      })

    return () => {
      active = false
    }
  }, [])

  return <ModulePanel title="Runtime" description={view.description} status={view.status} />
}
