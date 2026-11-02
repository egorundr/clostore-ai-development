import 'server-only'

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is not configured')
}

type PoolCache = typeof globalThis & { clostorePool?: Pool }
const poolCache = globalThis as PoolCache

export const pool = poolCache.clostorePool ?? new Pool({
  connectionString,
  max: 10,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
})

if (process.env.NODE_ENV !== 'production') {
  poolCache.clostorePool = pool
}

export const db = drizzle(pool, { schema })
