// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RuntimePage from '../../src/app/(app)/runtime/page'
import { ModulePanel } from '../../src/components/module-panel'

function healthResponding(payload: Record<string, unknown>) {
  const fetchMock = vi.fn(async () => Response.json(payload))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('ModulePanel status', () => {
  // Four other pages render this panel without a status and must keep the
  // conservative badge they had before it became configurable.
  it('still reports NOT_CONNECTED when no status is given', () => {
    render(<ModulePanel title="Projects" description="unchanged" />)
    expect(screen.getByRole('status')).toHaveTextContent(/^NOT_CONNECTED$/)
  })

  it('renders the status it is given', () => {
    render(<ModulePanel title="Runtime" description="live" status="CONNECTED" />)
    expect(screen.getByRole('status')).toHaveTextContent(/^CONNECTED$/)
  })
})

describe('Runtime page reflects /api/health', () => {
  it('reports CONNECTED with the runtime version and provider it was told', async () => {
    healthResponding({
      gateway: 'CONNECTED',
      backend: 'CONNECTED',
      runtimeVersion: '2026.08.30.1',
      provider: 'xai',
    })

    render(<RuntimePage />)

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/^CONNECTED$/),
    )
    expect(screen.getByText(/Runtime 2026\.08\.30\.1/)).toBeInTheDocument()
    expect(screen.getByText(/provider xai/)).toBeInTheDocument()
  })

  it('reports DEGRADED when only one side answers', async () => {
    healthResponding({ gateway: 'CONNECTED', backend: 'NOT_CONNECTED' })

    render(<RuntimePage />)

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/^DEGRADED$/),
    )
  })

  it('reports NOT_CONNECTED when neither side is up', async () => {
    healthResponding({ gateway: 'NOT_CONNECTED', backend: 'NOT_CONNECTED' })

    render(<RuntimePage />)

    await waitFor(() =>
      expect(screen.getByText(/Neither the gateway nor the canonical runtime/)).toBeInTheDocument(),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/^NOT_CONNECTED$/)
  })

  // An unreadable health endpoint is not evidence of connectivity.
  it('does not claim connectivity when the health request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))

    render(<RuntimePage />)

    await waitFor(() =>
      expect(screen.getByText(/Neither the gateway nor the canonical runtime/)).toBeInTheDocument(),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/^NOT_CONNECTED$/)
  })
})
