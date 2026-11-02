import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'

function exactOrigin(value: string | undefined) {
  if (!value) return undefined

  try {
    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`
    return new URL(normalized).origin
  } catch {
    return undefined
  }
}

const baseURL =
  exactOrigin(process.env.BETTER_AUTH_URL) ??
  exactOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
  exactOrigin(process.env.VERCEL_URL) ??
  exactOrigin(process.env.V0_RUNTIME_URL)

const developmentOrigins = [
  'http://localhost:3000',
  process.env.V0_RUNTIME_URL,
  process.env.V0_DEV_APP_URL,
  process.env.V0_BUILD_URL,
  process.env.V0_SANDBOX_URL,
].map(exactOrigin).filter((origin): origin is string => Boolean(origin))

const productionOrigins = [
  process.env.VERCEL_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
].map(exactOrigin).filter((origin): origin is string => Boolean(origin))

export const auth = betterAuth({
  database: pool,
  baseURL,
  advanced: {
    ...((process.env.NODE_ENV === 'development') ? { defaultCookieAttributes: { sameSite: 'none' as const, secure: true } } : {}),
  },
  trustedOrigins: process.env.NODE_ENV === 'development' ? developmentOrigins : productionOrigins,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
})
