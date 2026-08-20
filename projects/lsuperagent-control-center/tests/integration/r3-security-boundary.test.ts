// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const disabledRoutes = [
  'src/app/api/execute/route.ts',
  'src/app/api/memory/route.ts',
  'src/app/api/memory/candidate/route.ts',
  'src/app/api/tools/route.ts',
  'src/app/api/audit/route.ts',
]

describe('R3 canonical gateway authority boundary', () => {
  it('exposes only health and chat server routes for R3', () => {
    expect(existsSync(resolve(process.cwd(), 'src/app/api/health/route.ts'))).toBe(true)
    expect(existsSync(resolve(process.cwd(), 'src/app/api/chat/route.ts'))).toBe(true)

    for (const route of disabledRoutes) {
      expect(existsSync(resolve(process.cwd(), route))).toBe(false)
    }
  })

  it('does not introduce provider, direct Supabase, or public gateway authority', () => {
    const sourcePaths = [
      'src/app/api/chat/route.ts',
      'src/lib/gateway/service-auth.ts',
      'src/lib/gateway/chat-request.ts',
      'src/lib/gateway/context.ts',
      'src/lib/gateway/response.ts',
      'src/lib/gateway/types.ts',
    ]

    const source = sourcePaths
      .map((path) => readFileSync(resolve(process.cwd(), path), 'utf8'))
      .join('\n')
      .toLowerCase()

    const forbidden = [
      '@supabase/',
      'openai',
      'anthropic',
      'gemini',
      'next_public_lsuperagent_gateway',
      'service_' + 'role',
    ]

    for (const marker of forbidden) {
      expect(source).not.toContain(marker)
    }
  })
})
