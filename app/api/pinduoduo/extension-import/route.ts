import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createPinduoduoImportReport, importPinduoduoProduct } from '@/app/actions/pinduoduo'
import { getPersonalWorkspaceUserId } from '@/lib/personal-workspace'
import { hasPinduoduoExtensionScope, verifyPinduoduoExtensionToken } from '@/lib/pinduoduo-extension-token'

export const runtime = 'nodejs'
export const maxDuration = 60

const productSchema = z.object({
  name: z.string().trim().min(2).max(180),
  productUrl: z.string().url().max(2048),
  priceCny: z.number().finite().nonnegative().max(100_000_000),
  sellerName: z.string().trim().max(180).optional().default(''),
  salesHint: z.string().trim().max(120).optional().default(''),
  imageUrls: z.array(z.string().url().max(2048)).max(4).default([]),
})

const importRequestSchema = z.object({
  products: z.array(productSchema).min(1).max(12),
})

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  const claims = token ? verifyPinduoduoExtensionToken(token) : null
  if (!claims) return NextResponse.json({ ok: false, message: 'Invalid or expired import token.' }, { status: 401 })

  const ownerId = await getPersonalWorkspaceUserId()
  if (claims.userId !== ownerId || claims.audience !== 'clostore-pinduoduo-import' || !hasPinduoduoExtensionScope(claims, 'products:import')) {
    return NextResponse.json({ ok: false, message: 'Import token is not authorized.' }, { status: 403 })
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > 100_000) {
    return NextResponse.json({ ok: false, message: 'Import payload is too large.' }, { status: 413 })
  }

  let payload: unknown
  try {
    const body = await request.text()
    if (new TextEncoder().encode(body).byteLength > 100_000) {
      return NextResponse.json({ ok: false, message: 'Import payload is too large.' }, { status: 413 })
    }
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON payload.' }, { status: 400 })
  }

  const parsed = importRequestSchema.safeParse(payload)
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Invalid product data.' }, { status: 400 })

  let imported = 0
  let duplicates = 0
  let rejected = 0
  const productIds: string[] = []

  for (const product of parsed.data.products) {
    const result = await importPinduoduoProduct(product)
    if (!result.ok) {
      rejected += 1
    } else if (result.alreadySaved) {
      duplicates += 1
      productIds.push(result.productId)
    } else {
      imported += 1
      productIds.push(result.productId)
    }
  }

  let agentReport: { ok: boolean; text?: string; status?: string; pendingApprovalCount?: number; reason?: string } = {
    ok: false,
    reason: 'no_imported_products',
  }
  if (productIds.length) {
    try {
      const report = await createPinduoduoImportReport(productIds)
      agentReport = report.ok
        ? {
            ok: true,
            text: report.task.response,
            status: report.task.status,
            pendingApprovalCount: report.task.pendingApprovals.length,
          }
        : { ok: false, reason: report.reason }
    } catch {
      agentReport = { ok: false, reason: 'agent_unavailable' }
    }
  }

  return NextResponse.json({ ok: true, imported, duplicates, rejected, agentReport })
}
