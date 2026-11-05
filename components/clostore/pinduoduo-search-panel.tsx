'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, ExternalLink, LoaderCircle, Search, Upload } from 'lucide-react'
import { startAgentPhotoSearch } from '@/app/actions/agent'
import { createPinduoduoExtensionToken, createPinduoduoImportReport, importPinduoduoProduct } from '@/app/actions/pinduoduo'
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

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('photo_read_failed'))
    }, { once: true })
    reader.addEventListener('error', () => reject(new Error('photo_read_failed')), { once: true })
    reader.readAsDataURL(file)
  })
}

export function PinduoduoSearchPanel({ onSearchStarted }: { onSearchStarted?: () => void }) {
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
  const [extensionToken, setExtensionToken] = useState('')
  const [tokenPending, setTokenPending] = useState(false)
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

  async function generateExtensionToken() {
    setNotice('')
    setError('')
    setTokenPending(true)
    try {
      const result = await createPinduoduoExtensionToken()
      if (!result.ok) {
        setError(result.message)
        return
      }
      setExtensionToken(result.token)
      try {
        await navigator.clipboard.writeText(result.token)
        setNotice('Временный токен скопирован. Вставьте его в настройки расширения; он действует 15 минут.')
      } catch {
        setNotice('Токен создан. Скопируйте его из поля ниже; срок действия — 15 минут.')
      }
    } catch {
      setError('Не удалось создать токен. Обновите страницу и попробуйте ещё раз.')
    } finally {
      setTokenPending(false)
    }
  }

  async function copyAppAddress() {
    try {
      await navigator.clipboard.writeText(window.location.origin)
      setNotice('Адрес Clostore скопирован. Вставьте его в настройки расширения.')
      setError('')
    } catch {
      setError('Не удалось скопировать адрес приложения.')
      setNotice('')
    }
  }

  async function copyExtensionToken() {
    if (!extensionToken) return
    try {
      await navigator.clipboard.writeText(extensionToken)
      setNotice('Токен скопирован.')
      setError('')
    } catch {
      setError('Не удалось скопировать токен. Выберите его в поле и скопируйте вручную.')
    }
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

  function startPhotoSearch() {
    if (!referencePhoto) return
    const photo = referencePhoto
    setNotice('')
    setError('')
    startTransition(async () => {
      try {
        const result = await startAgentPhotoSearch(await readFileAsDataUrl(photo))
        if (!result.ok) {
          const messages: Record<string, string> = {
            invalid_input: 'Не удалось проверить фото. Выберите JPEG или PNG до 500 КБ.',
            permission_disabled: 'Сначала включите постоянное разрешение Pinduoduo в разделе AI-агент и подключите расширение.',
            api_key_missing: 'AI-агент не настроен для обработки результатов поиска.',
            rate_limited: 'Достигнут лимит задач AI-агента. Попробуйте позже.',
          }
          setError(messages[result.reason] ?? 'Не удалось поставить фото-поиск в очередь.')
          return
        }

        setNotice('Фото-поиск поставлен в очередь. Подключённое расширение выполнит поиск в фоне; задача открыта в AI-агенте.')
        router.refresh()
        onSearchStarted?.()
      } catch {
        setError('Не удалось передать фото в очередь поиска. Попробуйте ещё раз.')
      }
    })
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
        const savedNotice = result.alreadySaved ? 'Этот товар уже есть в очереди проверки.' : 'Товар добавлен в очередь проверки.'
        let reportNotice = 'Отчёт агента пока не сформирован. Товар сохранён; запросите отчёт в разделе AI-агент.'
        try {
          const report = await createPinduoduoImportReport([result.productId])
          if (report.ok) {
            const approvalNote = report.task.pendingApprovals.length
              ? `\n\nПодготовлено изменений карточки: ${report.task.pendingApprovals.length}. Подтвердите их в разделе AI-агент.`
              : '\n\nПолный отчёт сохранён в истории AI-агента.'
            reportNotice = `Отчёт агента:\n${report.task.response}${approvalNote}`
          }
        } catch {
          reportNotice = 'Отчёт агента пока не сформирован. Товар сохранён; запросите отчёт в разделе AI-агент.'
        }
        setNotice(`${savedNotice}\n\n${reportNotice}`)
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
              <CardTitle id="pinduoduo-search-title">Поиск и парсинг Pinduoduo</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Расширение читает только отображённые карточки. Фото-поиск открывается в фоне после вашего запроса в CloStore.</p>
            </div>
            <Badge variant="outline" className="border-emerald-300/20 text-emerald-100">Браузерный парсер</Badge>
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

          <div className="flex flex-col gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] p-4">
            <div>
              <h3 className="text-sm font-medium">Подключить бесплатный парсер браузера</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Парсер читает только отображённые карточки на текущей странице. Он не получает пароль или cookies Pinduoduo, не обращается к скрытым API и останавливается при CAPTCHA или блокировке.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/pinduoduo-parser-extension.zip" download className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Скачать расширение Chrome
              </a>
              <Button type="button" variant="outline" size="sm" onClick={copyAppAddress}>
                <Copy data-icon="inline-start" />Скопировать адрес Clostore
              </Button>
              <Button type="button" size="sm" onClick={generateExtensionToken} disabled={tokenPending}>
                {tokenPending ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Copy data-icon="inline-start" />}
                Создать токен импорта
              </Button>
            </div>
            {extensionToken && (
              <Field>
                <FieldLabel htmlFor="pdd-extension-token">Временный токен (действует 15 минут)</FieldLabel>
                <div className="flex gap-2">
                  <Input id="pdd-extension-token" type="password" value={extensionToken} readOnly autoComplete="off" />
                  <Button type="button" variant="outline" onClick={copyExtensionToken} aria-label="Скопировать временный токен">
                    <Copy data-icon="inline-start" />
                  </Button>
                </div>
              </Field>
            )}
            <ol className="flex flex-col gap-1 text-xs leading-5 text-muted-foreground">
              <li>1. Распакуйте ZIP и загрузите папку в Chrome через «Расширения» → «Режим разработчика» → «Загрузить распакованное».</li>
              <li>2. В расширении укажите адрес Clostore и временный токен из этого окна.</li>
              <li>3. Откройте поиск Pinduoduo выше, нажмите значок расширения и выберите «Считать товары с этой страницы».</li>
              <li>4. После импорта агент автоматически составит отчёт и подготовит предложения для карточек. Подтвердите изменения в разделе AI-агент.</li>
              <li>5. Поиск агента при включённом постоянном разрешении выполняется расширением автоматически; результаты передаются агенту.</li>
            </ol>
          </div>

          <div className="grid gap-4 border-t border-white/[0.06] pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(250px,0.8fr)]">
            <div className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-medium">Автоматический поиск по фото</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Фото временно передаётся в очередь CloStore и расширению Chrome, но не отправляется AI-модели. После завершения поиска или отмены задачи файл удаляется из очереди.</p>
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
                    <p className="text-[11px] text-muted-foreground">{Math.ceil(referencePhoto.size / 1024)} КБ</p>
                  </div>
                  {referencePhotoUrl && <a href={referencePhotoUrl} download={referencePhoto.name} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Скачать</a>}
                </div>
              )}
              <Button type="button" onClick={startPhotoSearch} disabled={!referencePhoto || pending}>
                {pending ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Search data-icon="inline-start" />}
                {pending ? 'Отправляю фото…' : 'Искать автоматически'}
              </Button>
              {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
              {notice && <p role="status" className="text-xs leading-5 text-muted-foreground">{notice}</p>}
            </div>
            <div className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs leading-5 text-muted-foreground">
              <p>Дальше расширение само откроет фоновую вкладку, загрузит фото и передаст найденные карточки AI-агенту — ничего нажимать на Pinduoduo не нужно.</p>
              <p>Для первого запуска подключите расширение, включите постоянное разрешение в разделе AI-агент и войдите в Pinduoduo в Chrome. CAPTCHA и страницы входа не обходятся; в этих случаях поиск остановится.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/[0.07] bg-card/80 shadow-none">
        <CardHeader>
          <CardTitle>Ручной импорт по ссылке</CardTitle>
          <p className="text-xs leading-5 text-muted-foreground">Запасной способ, если браузерное расширение не распознало карточку. Импорт создаёт черновик для проверки.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="pdd-share-text">Скопированный текст Pinduoduo (необязательно)</FieldLabel>
            <Textarea id="pdd-share-text" value={shareText} onChange={(event) => setShareText(event.target.value)} maxLength={5000} placeholder="Вставьте текст карточки или сообщения «Поделиться»" className="min-h-20" />
          </Field>
          <Button type="button" variant="secondary" onClick={parseCopiedShareText} disabled={!shareText.trim()}>
            <Search data-icon="inline-start" />Разобр��ть скопированный текст
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
                {pending ? 'Импортируем и готовим отчёт…' : 'Добавить в очередь проверки'}
              </Button>
            </div>
          </form>
          {notice && <p role="status" aria-live="polite" className="max-h-72 overflow-y-auto whitespace-pre-wrap text-sm text-emerald-200">{notice}</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </section>
  )
}
