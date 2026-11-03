import 'server-only'

import { createHash } from 'node:crypto'
import type { PinduoduoSearchResult } from '@/components/clostore/types'

const ROUTER_ENDPOINT = 'https://gw-api.pinduoduo.com/api/router'
const IMAGE_SEARCH_ENDPOINT = 'https://open-api.pinduoduo.com/api/image_search'
const RESULT_LIMIT = 12

type ApiRecord = Record<string, unknown>
type ApiParams = Record<string, unknown>

function isRecord(value: unknown): value is ApiRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function serializeParam(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function createSignature(params: ApiParams, secret: string) {
  const canonical = Object.entries(params)
    .filter(([key]) => key !== 'sign')
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}${serializeParam(value)}`)
    .join('')

  return createHash('md5').update(`${secret}${canonical}${secret}`).digest('hex').toUpperCase()
}

function getCredentials() {
  const clientId = process.env.PINDUODUO_CLIENT_ID?.trim()
  const clientSecret = process.env.PINDUODUO_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) throw new Error('pinduoduo_not_configured')
  return { clientId, clientSecret }
}

async function requestPinduoduo(endpoint: string, params: ApiParams, method: 'GET' | 'POST' = 'POST') {
  const { clientSecret } = getCredentials()
  const payload = { ...params, sign: createSignature(params, clientSecret) }
  const url = new URL(endpoint)
  const requestInit: RequestInit = {
    method,
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  }

  if (method === 'GET') {
    for (const [key, value] of Object.entries(payload)) url.searchParams.set(key, serializeParam(value))
  } else {
    requestInit.headers = { 'content-type': 'application/json' }
    requestInit.body = JSON.stringify(payload)
  }

  const response = await fetch(url, requestInit)

  if (!response.ok) throw new Error('pinduoduo_http_error')

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error('pinduoduo_invalid_response')
  }

  if (!isRecord(data)) throw new Error('pinduoduo_invalid_response')
  const apiError = isRecord(data.error_response) ? data.error_response : isRecord(data.error) ? data.error : null
  if (apiError || ('error_code' in data && Number.isFinite(Number(data.error_code)) && Number(data.error_code) !== 0)) {
    throw new Error('pinduoduo_api_rejected')
  }

  return data
}

function getGoodsRows(data: ApiRecord) {
  const candidates: unknown[] = [
    isRecord(data.goods_search_response) ? data.goods_search_response.goods_list : undefined,
    isRecord(data.result) ? data.result.goods_list : undefined,
    isRecord(data.data) ? data.data.goods_list : undefined,
    data.goods_list,
  ]

  return candidates.find(Array.isArray) as unknown[] | undefined ?? []
}

function firstString(record: ApiRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return null
}

function firstPriceInFen(record: ApiRecord) {
  for (const key of ['min_group_price', 'min_normal_price', 'price', 'goods_price']) {
    const value = record[key]
    if (typeof value === 'number' || typeof value === 'string') {
      const parsed = Number(value)
      if (Number.isFinite(parsed) && parsed >= 0) return Math.round((parsed / 100) * 100) / 100
    }
  }
  return null
}

function safeHttpsUrl(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    url.protocol = 'https:'
    return url.toString()
  } catch {
    return null
  }
}

function isPinduoduoHost(hostname: string) {
  const host = hostname.toLowerCase()
  return host === 'pinduoduo.com' || host.endsWith('.pinduoduo.com') || host === 'yangkeduo.com' || host.endsWith('.yangkeduo.com')
}

function normalizeGoods(record: unknown): PinduoduoSearchResult | null {
  if (!isRecord(record)) return null

  const goodsId = firstString(record, ['goods_id', 'goodsId', 'id'])
  const name = firstString(record, ['goods_name', 'goodsName', 'name', 'title'])
  if (!goodsId || !name) return null

  const imageUrl = safeHttpsUrl(firstString(record, ['goods_image_url', 'goods_thumbnail_url', 'image_url', 'img_url', 'goods_img']))
  const receivedUrl = safeHttpsUrl(firstString(record, ['goods_url', 'goods_detail_url', 'url']))
  let productUrl = receivedUrl
  if (receivedUrl) {
    try {
      if (!isPinduoduoHost(new URL(receivedUrl).hostname)) productUrl = null
    } catch {
      productUrl = null
    }
  }
  productUrl ??= `https://mobile.yangkeduo.com/goods.html?goods_id=${encodeURIComponent(goodsId)}`

  return {
    goodsId,
    name: name.slice(0, 180),
    priceCny: firstPriceInFen(record),
    imageUrl,
    productUrl,
    sellerName: firstString(record, ['mall_name', 'mallName', 'seller_name', 'shop_name'])?.slice(0, 180) ?? null,
    salesHint: firstString(record, ['sales_tip', 'salesTip', 'sales', 'sold_quantity'])?.slice(0, 120) ?? null,
  }
}

function normalizeResults(data: ApiRecord) {
  return getGoodsRows(data)
    .map(normalizeGoods)
    .filter((item): item is PinduoduoSearchResult => item !== null)
    .slice(0, RESULT_LIMIT)
}

function apiBaseParams(clientId: string) {
  return {
    client_id: clientId,
    data_type: 'JSON',
    timestamp: Math.floor(Date.now() / 1000),
  }
}

export async function searchPinduoduoProducts(input: {
  query: string
  minPriceCny?: number | null
  maxPriceCny?: number | null
}) {
  const { clientId } = getCredentials()
  const goodsSearchRequest: ApiRecord = {
    keyword: input.query,
    page: 1,
    page_size: RESULT_LIMIT,
  }

  if (input.minPriceCny !== null && input.minPriceCny !== undefined || input.maxPriceCny !== null && input.maxPriceCny !== undefined) {
    goodsSearchRequest.range_list = [{
      range_id: 0,
      ...(input.minPriceCny === null || input.minPriceCny === undefined ? {} : { range_from: Math.round(input.minPriceCny * 100) }),
      ...(input.maxPriceCny === null || input.maxPriceCny === undefined ? {} : { range_to: Math.round(input.maxPriceCny * 100) }),
    }]
  }

  const data = await requestPinduoduo(ROUTER_ENDPOINT, {
    ...apiBaseParams(clientId),
    type: 'pdd.ddk.goods.search',
    goods_search_req: goodsSearchRequest,
  }, 'GET')

  return normalizeResults(data)
}

export async function searchPinduoduoByImage(imageUrl: string) {
  const { clientId } = getCredentials()
  const data = await requestPinduoduo(IMAGE_SEARCH_ENDPOINT, {
    ...apiBaseParams(clientId),
    type: 'image_search',
    image_url: imageUrl,
    page: 1,
    page_size: RESULT_LIMIT,
    size_type: 0,
  })

  return normalizeResults(data)
}
