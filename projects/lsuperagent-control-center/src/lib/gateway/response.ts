import { NextResponse } from 'next/server'
import type { PublicGatewayCode } from './types'

export function gatewayError(
  status: number,
  requestId: string,
  code: PublicGatewayCode,
) {
  return NextResponse.json({ requestId, code }, { status })
}

export function providerDisabled(requestId: string) {
  return NextResponse.json(
    {
      requestId,
      gateway: 'CONNECTED',
      execution: 'NOT_CONNECTED',
      code: 'UPSTREAM_UNAVAILABLE',
      message:
        'Canonical gateway verified the request; provider execution is disabled in R3.',
    },
    { status: 503 },
  )
}
