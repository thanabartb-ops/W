// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const gatewayFiles = [
  'src/lib/gateway/r3-auth.ts',
  'src/lib/gateway/r3-config.ts',
  'src/lib/gateway/r3-contract.ts',
  'src/app/api/chat/route.ts',
]

function sourceText() {
  return gatewayFiles
    .map((path) => readFileSync(join(root, path), 'utf8'))
    .join('\n')
}

describe('R3 canonical source boundary', () => {
  it('contains no provider or Supabase runtime dependency in the R3 gateway surface', () => {
    const source = sourceText().toLowerCase()
    expect(source).not.toContain("from 'openai'")
    expect(source).not.toContain('anthropic')
    expect(source).not.toContain('gemini')
    expect(source).not.toContain('@supabase/')
    expect(source).not.toContain('.from(')
    expect(source).not.toContain('.insert(')
    expect(source).not.toContain('.update(')
    expect(source).not.toContain('.upsert(')
  })

  it('activates only health and canonical chat API routes', () => {
    expect(existsSync(join(root, 'src/app/api/health/route.ts'))).toBe(true)
    expect(existsSync(join(root, 'src/app/api/chat/route.ts'))).toBe(true)

    for (const route of ['execute', 'memory', 'tools', 'audit']) {
      expect(existsSync(join(root, `src/app/api/${route}/route.ts`))).toBe(false)
    }
  })

  it('preserves the original two-line public env contract', () => {
    const envLines = readFileSync(join(root, '.env.example'), 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)

    expect(envLines).toEqual([
      'NEXT_PUBLIC_SUPABASE_URL=',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=',
    ])
  })

  it('contains no token-like committed value in the R3 gateway source', () => {
    const source = sourceText()
    expect(source).not.toMatch(/sk-[A-Za-z0-9_-]{12,}/)
    expect(source).not.toMatch(/sb_secret_[A-Za-z0-9_-]{12,}/)
  })
})
