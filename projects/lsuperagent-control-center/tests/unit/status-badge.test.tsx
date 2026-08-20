import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusBadge } from '../../src/components/status-badge'

describe('StatusBadge', () => {
  it('renders exact NOT_CONNECTED semantics', () => {
    render(<StatusBadge status="NOT_CONNECTED" />)
    expect(screen.getByRole('status')).toHaveTextContent(/^NOT_CONNECTED$/)
  })
})
