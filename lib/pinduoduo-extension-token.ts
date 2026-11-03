import 'server-only'

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

const tokenTtlSeconds = 15 * 60
const claimsSchema = z.object({
  version: z.literal(1),
  audience: z.literal('clostore-pinduoduo-import'),
  scope: z.literal('products:import'),
  userId: z.string().min(1).max(120),
  expiresAt: z.number().int().positive(),
  nonce: z.string().uuid(),
})

type TokenClaims = z.infer<typeof claimsSchema>

function getSecret() {
  const secret = process.env.BETTER_AUTH_SECRET?.trim()
  if (!secret || secret.length < 32) throw new Error('A strong Better Auth secret is required to issue parser tokens.')
  return secret
}

function sign(value: string) {
  return createHmac('sha256', getSecret()).update(value).digest()
}

export function issuePinduoduoExtensionToken(userId: string) {
  const claims: TokenClaims = {
    version: 1,
    audience: 'clostore-pinduoduo-import',
    scope: 'products:import',
    userId,
    expiresAt: Math.floor(Date.now() / 1000) + tokenTtlSeconds,
    nonce: randomUUID(),
  }
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signature = sign(payload).toString('base64url')

  return { token: `${payload}.${signature}`, expiresAt: claims.expiresAt * 1000 }
}

export function verifyPinduoduoExtensionToken(token: string) {
  if (token.length > 4096) return null
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) return null

  let providedSignature: Buffer
  let decodedClaims: unknown
  try {
    providedSignature = Buffer.from(signature, 'base64url')
    const expectedSignature = sign(payload)
    if (providedSignature.length !== expectedSignature.length || !timingSafeEqual(providedSignature, expectedSignature)) return null
    decodedClaims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  const parsed = claimsSchema.safeParse(decodedClaims)
  if (!parsed.success || parsed.data.expiresAt <= Math.floor(Date.now() / 1000)) return null

  return parsed.data
}
