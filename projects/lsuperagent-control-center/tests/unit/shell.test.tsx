import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Home from '../../src/app/page'

describe('R1 shell', () => {
  it('shows the LSUPERAGENT Control Center title', () => {
    render(<Home />)
    expect(screen.getByText('LSUPERAGENT Control Center')).toBeInTheDocument()
  })
  it('shows the disconnected backend status', () => {
    render(<Home />)
    expect(screen.getByText('NOT_CONNECTED')).toBeInTheDocument()
  })
})
