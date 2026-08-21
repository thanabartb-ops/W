import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Home from '../../src/app/page'

describe('LSUPERAGENT mobile home', () => {
  it('shows the locked brand hierarchy', () => {
    render(<Home />)
    expect(screen.getByRole('heading', { name: 'LSUPERAGENT' })).toBeInTheDocument()
    expect(screen.getByText('Your AI. Your rules.')).toBeInTheDocument()
  })

  it('shows the four primary quick actions', () => {
    render(<Home />)
    expect(screen.getByText('Create Image')).toBeInTheDocument()
    expect(screen.getByText('Create Sticker')).toBeInTheDocument()
    expect(screen.getByText('Research')).toBeInTheDocument()
    expect(screen.getByText('Agents')).toBeInTheDocument()
  })

  it('keeps the command surface available', () => {
    render(<Home />)
    expect(screen.getByRole('searchbox', { name: 'Ask LSUPERAGENT' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send to LSUPERAGENT' })).toBeInTheDocument()
  })
})
