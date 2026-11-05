import { NextResponse } from 'next/server'
import { z } from 'zod'
import { claimPinduoduoAgentCommand, completePinduoduoAgentCommand } from '@/app/actions/agent'

export const runtime = 'nodejs'
export const maxDuration = 60

const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('claim') }),
  z.object({
    action: z.literal('complete'),
    taskId: z.string().min(1).max(64),
    commandId: z.string().min(1).max(64),
    products: z.array(z.unknown()).max(12),
    status: z.enum(['ok', 'empty', 'challenge', 'photo_upload_failed']).optional(),
  }),
])

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token || token.length > 4096) {
    return NextResponse.json({ ok: false, reason: 'not_authorized' }, { status: 401 })
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > 100_000) {
    return NextResponse.json({ ok: false, reason: 'payload_too_large' }, { status: 413 })
  }

  let payload: unknown
  try {
    const body = await request.text()
    if (new TextEncoder().encode(body).byteLength > 100_000) {
      return NextResponse.json({ ok: false, reason: 'payload_too_large' }, { status: 413 })
    }
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_json' }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(payload)
  if (!parsed.success) return NextResponse.json({ ok: false, reason: 'invalid_input' }, { status: 400 })

  const result = parsed.data.action === 'claim'
    ? await claimPinduoduoAgentCommand(token)
    : await completePinduoduoAgentCommand(token, parsed.data)

  if (!result.ok) {
    const status = result.reason === 'not_authorized'
      ? 403
      : result.reason === 'stale_command'
        ? 409
        : result.reason === 'api_key_missing'
          ? 503
          : 400
    return NextResponse.json(result, { status })
  }

  return NextResponse.json(result)
}
