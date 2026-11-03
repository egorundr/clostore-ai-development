'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, LoaderCircle, Search, Upload } from 'lucide-react'
import { importPinduoduoProduct } from '@/app/actions/pinduoduo'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ImageUploadField } from '@/components/clostore/image-upload-field'

const PINDUODUO_HOME = 'https://mobile.yangkeduo.com'
const MAX_REFERENCE_PHOTO_BYTES = 500 * 1024

function getProductLink(text: string) {
  const candidate = text.match(/https?:\/\/[^\s]+/i)?.[0]?.replace(/[.,，。)\]}>'"»]+$/g, '')
  if (!candidate) return ''

  try {
    const url = new URL(candidate)
    const hostname = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || !(hostname === 'pinduoduo.com' || hostname.endsWith('.pinduoduo.com') || hostname === 'yangkeduo.com' || hostname.endsWith('.yangkeduo.com'))) return ''
    return url.toString()
  } catch {
    return ''
  }
}

function parsePrice(text: string) {
  const match = text.match(/(?:¥|￥)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:元|CNY)/i)
  const value = match?.[1] ?? match?.[2]
  if (!value) return ''
  const price = Number(value.replaceAll(',', ''))
  return Number.isFinite(price) ? String(price) : ''
}

export function PinduoduoSearchPanel() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [shareText, setShareText] = useState('')
  const [referencePhoto, setReferencePhoto] = useState<File | null>(null)
  const [referencePhotoUrl, setReferencePhotoUrl] = useState('')
  const [name, setName] = useState('')
  const [productUrl, setProductUrl] = useState('')
  const [priceCny, setPriceCny] = useState('')
  const [sellerName, setSellerName] = useState('')
  const [salesHint, setSalesHint] = useState('')
  const [productImages, setProductImages] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    return () => {
      if (referencePhotoUrl) URL.revokeObjectURL(referencePhotoUrl)
    }
  }, [referencePhotoUrl])

  const searchUrl = query.trim().length >= 2
    ? `${PINDUODUO_HOME}/search_result.html?search_key=${encodeURIComponent(query.trim())}`
    : ''

  function parseCopiedShareText() {
    const link = getProductLink(shareText)
    const price = parsePrice(shareText)
    const firstTextLine = shareText
      .split(/\r?\n/)
      .map((line) => line.replace(/https?:\/\/[^\s]+/gi, '').trim())
      .find((line) => line && !/^(复制|打开|查看|长按)/.test(line))

    if (link) setProductUrl(link)
    if (price) setPriceCny(price)
    if (firstTextLine && !name) setName(firstTextLine.slice(0, 180))
    if (!link && !price && !firstTextLine) {
      setError('В скопированном тексте не нашлись данные. Заполните ссылку и поля вручную.')
      setNotice('')
      return
    }

    setError('')
    setNotice('Данные извлечены из скопированного текста. Проверьте их перед импортом.')
  }

  function handleReferencePhoto(file: File | undefined) {
    setNotice('')
    setError('')
    if (!file) {
      setReferencePhoto(null)
      setReferencePhotoUrl('')
      return
    }
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > MAX_REFERENCE_PHOTO_BYTES) {
      setReferencePhoto(null)
      setReferencePhotoUrl('')
      setError('Для фото-поиска выберите JPEG или PNG до 500 КБ.')
      return
    }
    setReferencePhoto(file)
    setReferencePhotoUrl(URL.createObjectURL(file))
  }

  function importProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice('')
    setError('')
    startTransition(async () => {
      try {
        const result = await importPinduoduoProduct({
          name,
          productUrl,
          priceCny: priceCny ? Number(priceCny) : 0,
          sellerName,
          salesHint,
          imageUrls: productImages,
        })
        if (!result.ok) {
          setError(result.message)
          return
        }
        setNotice(result.alreadySaved ? 'Этот товар уже есть в очереди проверки.' : 'Товар добавлен в очередь проверки.')
        router.refresh()
      } catch {
        setError('Не удалось добавить товар. Проверьте ссылку и попробуйте ещё раз.')
      }
    })
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="pinduoduo-search-title">
      <Card className="border-white/[0.07] bg-card/80 shadow-none">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle id="pinduoduo-search-title">Поиск Pinduoduo</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Без API-ключей, входа в аккаунт или автоматических запросов к площадке.</p>
            </div>
            <Badge variant="outline" className="border-emerald-300/20 text-emerald-100">Ручной режим</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <form onSubmit={(event) => event.preventDefault()} className="flex flex-col gap-3">
            <Field>
              <FieldLabel htmlFor="pdd-search-query">Поиск по словам</FieldLabel>
              <Input id="pdd-search-query" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} minLength={2} placeholder="Например, чёрная кожаная куртка" />
            </Field>
            {searchUrl ? (
              <a href={searchUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'default', size: 'sm' })}>
                <Search data-icon="inline-start" />Открыть поиск Pinduoduo<ExternalLink data-icon="inline-end" />
              </a>
            ) : (
              <Button type="button" disabled><Search data-icon="inline-start" />Введите минимум два символа</Button>
            )}
          </form>

          <div className="grid gap-4 border-t border-white/[0.06] pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(250px,0.8fr)]">
            <div className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-medium">Поиск по фото</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Фото остаётся на вашем устройстве. Загрузите его в официальном приложении Pinduoduo через значок камеры.</p>
              </div>
              <Field>
                <FieldLabel htmlFor="pdd-reference-photo">Фото для поиска (JPEG/PNG, до 500 КБ)</FieldLabel>
                <Input id="pdd-reference-photo" type="file" accept="image/jpeg,image/png" onChange={(event) => handleReferencePhoto(event.target.files?.[0])} />
              </Field>
              {referencePhoto && (
                <div className="flex items-center gap-3 rounded-md border border-white/[0.07] p-2">
                  {referencePhotoUrl && <img src={referencePhotoUrl} alt="Выбранное фото для поиска" className="size-14 rounded object-cover" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{referencePhoto.name}</p>
                    <p className="text-[11px] text-muted-foreground">{Math.ceil(referencePhoto.size / 1024)} КБ · локально</p>
                  </div>
                  {referencePhotoUrl && <a href={referencePhotoUrl} download={referencePhoto.name} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Скачать</a>}
                </div>
              )}
              <a href={PINDUODUO_HOME} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                <ExternalLink data-icon="inline-start" />Открыть Pinduoduo
              </a>
            </div>
            <ol className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs leading-5 text-muted-foreground">
              <li>1. Откройте официальный Pinduoduo и используйте камеру в строке поиска.</li>
              <li>2. Выберите это же фото из галереи и найдите подходящий товар.</li>
              <li>3. Скопируйте ссылку или текст «Поделиться» и вставьте его ниже.</li>
              <li>4. Заполните данные товара и добавьте его в очередь проверки.</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/[0.07] bg-card/80 shadow-none">
        <CardHeader>
          <CardTitle>Импорт товара по ссылке</CardTitle>
          <p className="text-xs leading-5 text-muted-foreground">Парсер обрабатывает только текст, который вы сами скопировали. Clostore не открывает страницу товара и не читает данные аккаунта.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="pdd-share-text">Скопированный текст Pinduoduo (необязательно)</FieldLabel>
            <Textarea id="pdd-share-text" value={shareText} onChange={(event) => setShareText(event.target.value)} maxLength={5000} placeholder="Вставьте текст карточки или сообщения «Поделиться»" className="min-h-20" />
          </Field>
          <Button type="button" variant="secondary" onClick={parseCopiedShareText} disabled={!shareText.trim()}>
            <Search data-icon="inline-start" />Разобрать скопированный текст
          </Button>

          <form onSubmit={importProduct} className="flex flex-col gap-4 border-t border-white/[0.06] pt-4">
            <FieldGroup className="grid gap-3 sm:grid-cols-2">
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="pdd-product-url">Ссылка на товар Pinduoduo</FieldLabel>
                <Input id="pdd-product-url" type="url" value={productUrl} onChange={(event) => setProductUrl(event.target.value)} required placeholder="https://mobile.yangkeduo.com/..." />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="pdd-product-name">Название товара</FieldLabel>
                <Input id="pdd-product-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={180} required placeholder="Название из карточки товара" />
              </Field>
              <Field>
                <FieldLabel htmlFor="pdd-product-price">Закупочная цена, CNY</FieldLabel>
                <Input id="pdd-product-price" type="number" min="0" step="0.01" inputMode="decimal" value={priceCny} onChange={(event) => setPriceCny(event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="pdd-product-seller">Продавец (необязательно)</FieldLabel>
                <Input id="pdd-product-seller" value={sellerName} onChange={(event) => setSellerName(event.target.value)} maxLength={180} />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="pdd-product-sales">Подсказка о продажах (необязательно)</FieldLabel>
                <Input id="pdd-product-sales" value={salesHint} onChange={(event) => setSalesHint(event.target.value)} maxLength={120} placeholder="Например, популярный товар" />
              </Field>
            </FieldGroup>
            <ImageUploadField id="pdd-product-images" label="Фото товара для каталога" value={productImages} onChange={setProductImages} maxImages={10} />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">Импорт создаёт товар со статусом «Проверка», не публикацию.</p>
              <Button type="submit" disabled={pending || !productUrl.trim() || !name.trim()}>
                {pending ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Upload data-icon="inline-start" />}
                Добавить в очередь проверки
              </Button>
            </div>
          </form>
          {notice && <p role="status" aria-live="polite" className="text-sm text-emerald-200">{notice}</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </section>
  )
}
