'use server'

import { Buffer } from 'node:buffer'
import { lookup } from 'node:dns/promises'
import { randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import { put } from '@vercel/blob'
import { generateText } from 'ai'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { products, publicationTemplates } from '@/lib/db/schema'
import { getPersonalWorkspaceUserId } from '@/lib/personal-workspace'

const MAX_SOURCE_IMAGES = 3
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_MODEL_INPUT_BYTES = 14 * 1024 * 1024
const supportedImageTypes = ['image/jpeg', 'image/png', 'image/webp'] as const

type SupportedImageType = typeof supportedImageTypes[number]
type DownloadedImage = { bytes: Buffer; mediaType: SupportedImageType }
type PreparedPhoto = { sourceUrl: string; imageUrl: string }

const preparePhotosSchema = z.object({
  productId: z.string().min(1).max(64),
  templateId: z.string().min(1).max(64).nullable(),
})

const savePhotosSchema = z.object({
  productId: z.string().min(1).max(64),
  imageUrls: z.array(z.string().max(2048)).min(1).max(MAX_SOURCE_IMAGES),
})

function isPublicIpv4(address: string) {
  const octets = address.split('.').map(Number)
  const [first, second, third] = octets
  if (octets.length !== 4 || !octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)) return false

  return !(
    first === 0 || first === 10 || first === 127 || first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168)) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100)) ) ||
    (first === 203 && second === 0 && third === 113)
  )
}

function isPublicAddress(address: string) {
  const version = isIP(address)
  if (version === 4) return isPublicIpv4(address)
  if (version !== 6) return false

  const normalized = address.toLowerCase().split('%')[0]
  if (normalized.startsWith('::ffff:')) {
    const mappedIpv4 = normalized.slice('::ffff:'.length)
    return isIP(mappedIpv4) === 4 && isPublicIpv4(mappedIpv4)
  }

  const firstSegment = Number.parseInt(normalized.split(':')[0] || '0', 16)
  return firstSegment >= 0x2000 && firstSegment <= 0x3fff && !normalized.startsWith('2001:db8:')
}

async function downloadImage(rawUrl: string): Promise<DownloadedImage> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Некорректная ссылка на изображение.')
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error('Для обработки подходят только публичные HTTPS-фото.')
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local')) {
    throw new Error('Ссылка на изображение недоступна для безопасной обработки.')
  }

  let addresses: string[]
  try {
    addresses = isIP(hostname) ? [hostname] : (await lookup(hostname, { all: true })).map(({ address }) => address)
  } catch {
    throw new Error('Не удалось найти сервер изображения.')
  }

  if (!addresses.length || addresses.some((address) => !isPublicAddress(address))) {
    throw new Error('Ссылка на изображение должна вести на публичный сервер.')
  }

  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) })
  if (!response.ok || !response.body) throw new Error('Не удалось загрузить фото товара.')

  const mediaType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (!supportedImageTypes.includes(mediaType as SupportedImageType)) {
    throw new Error('Поддерживаются изображения JPEG, PNG и WebP.')
  }

  const declaredSize = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredSize) && declaredSize > MAX_IMAGE_BYTES) {
    throw new Error('Размер одного фото не должен превышать 8 МБ.')
  }

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > MAX_IMAGE_BYTES) {
        await reader.cancel()
        throw new Error('Размер одного фото не должен превышать 8 МБ.')
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }

  if (!totalBytes) throw new Error('Пустое изображение нельзя обработать.')
  return { bytes: Buffer.concat(chunks, totalBytes), mediaType: mediaType as SupportedImageType }
}

function imageExtension(mediaType: string) {
  if (mediaType === 'image/jpeg') return 'jpg'
  if (mediaType === 'image/webp') return 'webp'
  return 'png'
}

function makeImagePrompt(hasTemplate: boolean) {
  if (hasTemplate) {
    return [
      'Это аккуратная ретушь фото для товарного объявления, не редизайн.',
      'Изображение 1 — исходное фото товара. Изображение 2 — точный загруженный пользователем шаблон оформления.',
      'Удали исходный фон вокруг товара и помести товар в свободную область шаблона. Шаблон используй как готовый неизменяемый фон: сохрани его точные цвета, текст, логотипы, рамки, расположение и композицию; не переписывай, не перерисовывай и не изменяй его элементы.',
      'Сам товар сохрани максимально точно: форму, оттенок, фактуру, швы, принты, надписи, логотипы и пропорции. Не добавляй новые детали, надписи или предметы. Если для показа товара нужен манекен или модель, сохрани их только в исходном виде.',
      'Сделай один квадратный итоговый кадр, пригодный для объявления. Не добавляй водяные знаки.',
    ].join(' ')
  }

  return [
    'Сделай профессиональную ретушь исходного фото для карточки товара.',
    'Удали исходный фон и замени его на чистый ровный белый фон без текстуры и надписей; добавь только мягкую естественную тень под товаром.',
    'Сам товар сохрани максимально точно: форму, оттенок, фактуру, швы, принты, надписи, логотипы и пропорции. Не добавляй новые детали, надписи или предметы. Если для показа товара нужен манекен или модель, сохрани их только в исходном виде.',
    'Расположи товар по центру квадратного кадра с аккуратными полями. Не добавляй водяные знаки.',
  ].join(' ')
}

export async function prepareProductListingPhotos(input: unknown) {
  const userId = await getPersonalWorkspaceUserId()
  const parsed = preparePhotosSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Проверьте выбранный товар и шаблон.' }

  const [product] = await db.select({ id: products.id, images: products.images })
    .from(products)
    .where(and(eq(products.id, parsed.data.productId), eq(products.userId, userId)))
    .limit(1)

  if (!product) return { ok: false as const, message: 'Товар не найден в вашем каталоге.' }
  const sourceUrls = [...new Set(Array.isArray(product.images) ? product.images : [])].slice(0, MAX_SOURCE_IMAGES)
  if (!sourceUrls.length) return { ok: false as const, message: 'В карточке товара пока нет фото для обработки.' }

  let templateImage: DownloadedImage | null = null
  if (parsed.data.templateId) {
    const [template] = await db.select({ imageTemplateUrl: publicationTemplates.imageTemplateUrl })
      .from(publicationTemplates)
      .where(and(eq(publicationTemplates.id, parsed.data.templateId), eq(publicationTemplates.userId, userId)))
      .limit(1)

    if (!template?.imageTemplateUrl) return { ok: false as const, message: 'В выбранном шаблоне нет загруженного изображения.' }
    try {
      templateImage = await downloadImage(template.imageTemplateUrl)
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : 'Не удалось загрузить изображение шаблона.' }
    }
  }

  const prompt = makeImagePrompt(Boolean(templateImage))
  const results = await Promise.allSettled(sourceUrls.map(async (sourceUrl): Promise<PreparedPhoto> => {
    const sourceImage = await downloadImage(sourceUrl)
    if (sourceImage.bytes.byteLength + (templateImage?.bytes.byteLength ?? 0) > MAX_MODEL_INPUT_BYTES) {
      throw new Error('Слишком большой размер исходных фото для одной обработки.')
    }

    const content = [
      { type: 'text' as const, text: prompt },
      { type: 'image' as const, image: sourceImage.bytes, mediaType: sourceImage.mediaType },
      ...(templateImage ? [{ type: 'image' as const, image: templateImage.bytes, mediaType: templateImage.mediaType }] : []),
    ]

    const generated = await generateText({
      model: 'google/gemini-3.1-flash-image',
      messages: [{ role: 'user', content }],
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(110_000),
    })

    const image = generated.files.find((file) => file.mediaType.startsWith('image/'))
    if (!image) throw new Error('Модель не вернула готовое изображение.')

    const extension = imageExtension(image.mediaType)
    const blob = await put(`clostore/prepared/${randomUUID()}.${extension}`, Buffer.from(image.uint8Array), {
      access: 'public',
      contentType: image.mediaType,
      addRandomSuffix: false,
    })

    return { sourceUrl, imageUrl: blob.url }
  }))

  const photos = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
  if (!photos.length) {
    return { ok: false as const, message: 'Не удалось подготовить фото. Проверьте доступность исходных изображений и попробуйте ещё раз.' }
  }

  return {
    ok: true as const,
    photos,
    failedCount: results.length - photos.length,
  }
}

export async function savePreparedProductPhotos(input: unknown) {
  const userId = await getPersonalWorkspaceUserId()
  const parsed = savePhotosSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Выберите подготовленные фото для сохранения.' }

  const imageUrls = [...new Set(parsed.data.imageUrls.map((rawUrl) => {
    try {
      const url = new URL(rawUrl)
      const isBlobHost = url.hostname === 'blob.vercel-storage.com' || url.hostname.endsWith('.blob.vercel-storage.com')
      if (url.protocol !== 'https:' || !isBlobHost || !url.pathname.startsWith('/clostore/prepared/')) throw new Error('Invalid generated photo URL')
      return url.toString()
    } catch {
      throw new Error('Сохранять можно только фото, подготовленные этим инструментом.')
    }
  }))]

  const [product] = await db.select({ images: products.images })
    .from(products)
    .where(and(eq(products.id, parsed.data.productId), eq(products.userId, userId)))
    .limit(1)

  if (!product) return { ok: false as const, message: 'Товар не найден в вашем каталоге.' }

  const existingImages = Array.isArray(product.images) ? product.images : []
  const newImages = imageUrls.filter((url) => !existingImages.includes(url))
  if (existingImages.length + newImages.length > 10) {
    return { ok: false as const, message: 'В карточке уже достаточно фото. Удалите часть старых фотографий в каталоге и повторите сохранение.' }
  }

  const nextImages = [...existingImages, ...newImages]
  await db.update(products).set({ images: nextImages, updatedAt: new Date() })
    .where(and(eq(products.id, parsed.data.productId), eq(products.userId, userId)))

  revalidatePath('/')
  return { ok: true as const, imageCount: newImages.length }
}
