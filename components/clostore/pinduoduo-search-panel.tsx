'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, LoaderCircle, Package, Plus, Search, ScanSearch } from 'lucide-react'
import { addPinduoduoResultToReview, searchPinduoduoByImage, searchPinduoduoProducts } from '@/app/actions/pinduoduo'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ImageUploadField } from '@/components/clostore/image-upload-field'
import type { PinduoduoSearchResult } from '@/components/clostore/types'

function priceLabel(value: number | null) {
  if (value === null) return 'Цена не указана'
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} ¥`
}

export function PinduoduoSearchPanel({ configured }: { configured: boolean }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [results, setResults] = useState<PinduoduoSearchResult[]>([])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [addedIds, setAddedIds] = useState<string[]>([])
  const [addingId, setAddingId] = useState('')
  const [pending, startTransition] = useTransition()

  function searchByText(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice('')
    setError('')
    startTransition(async () => {
      const result = await searchPinduoduoProducts({
        query,
        minPriceCny: minPrice ? Number(minPrice) : null,
        maxPriceCny: maxPrice ? Number(maxPrice) : null,
      })
      if (!result.ok) {
        setResults([])
        setError(result.message)
        return
      }
      setResults(result.results)
      setNotice(result.results.length ? `Найдено товаров: ${result.results.length}.` : 'По этим условиям Pinduoduo ничего не вернул.')
    })
  }

  function searchByPhoto() {
    setNotice('')
    setError('')
    if (!images[0]) {
      setError('Сначала загрузите фото товара.')
      return
    }

    startTransition(async () => {
      const result = await searchPinduoduoByImage({ imageUrl: images[0] })
      if (!result.ok) {
        setResults([])
        setError(result.message)
        return
      }
      setResults(result.results)
      setNotice(result.results.length ? `По фото найдено товаров: ${result.results.length}.` : 'Pinduoduo не вернул совпадений по этому фото.')
    })
  }

  function addToReview(item: PinduoduoSearchResult) {
    setError('')
    setNotice('')
    setAddingId(item.goodsId)
    startTransition(async () => {
      try {
        const result = await addPinduoduoResultToReview(item)
        if (!result.ok) {
          setError(result.message)
          return
        }
        setAddedIds((current) => current.includes(item.goodsId) ? current : [...current, item.goodsId])
        setNotice(result.alreadySaved ? 'Товар уже есть в очереди проверки.' : 'Товар добавлен в очередь проверки.')
        router.refresh()
      } catch {
        setError('Не удалось добавить товар. Обновите страницу и попробуйте ещё раз.')
      } finally {
        setAddingId('')
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
              <p className="mt-1 text-xs text-muted-foreground">Текстовый запрос или поиск похожих товаров по фото через API площадки.</p>
            </div>
            <Badge variant="outline" className={configured ? 'border-emerald-300/20 text-emerald-100' : 'border-amber-300/20 text-amber-100'}>
              {configured ? 'API подключён' : 'Нужны ключи API'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {!configured && <p role="status" className="rounded-lg border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs leading-5 text-amber-100/80">Добавьте PINDUODUO_CLIENT_ID и PINDUODUO_CLIENT_SECRET в Vars проекта. Поиск активируется после настройки приложения Open Platform с правом на нужные методы.</p>}
          <form onSubmit={searchByText} className="flex flex-col gap-4">
            <FieldGroup className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px_130px]">
              <Field className="sm:col-span-3"><FieldLabel htmlFor="pdd-search-query">Ключевые слова</FieldLabel><Input id="pdd-search-query" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} minLength={2} required placeholder="Например, чёрная кожаная куртка" /></Field>
              <Field><FieldLabel htmlFor="pdd-search-min">Цена от, CNY</FieldLabel><Input id="pdd-search-min" type="number" min="0" step="0.01" inputMode="decimal" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} /></Field>
              <Field><FieldLabel htmlFor="pdd-search-max">Цена до, CNY</FieldLabel><Input id="pdd-search-max" type="number" min="0" step="0.01" inputMode="decimal" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} /></Field>
              <div className="flex items-end"><Button type="submit" disabled={!configured || pending} className="w-full">{pending ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Search data-icon="inline-start" />}Найти товары</Button></div>
            </FieldGroup>
          </form>
          <div className="grid gap-3 border-t border-white/[0.06] pt-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0">
              <ImageUploadField
                id="pinduoduo-image-search"
                label="Фото для поиска"
                value={images}
                onChange={setImages}
                maxImages={1}
                maxImageSizeBytes={500 * 1024}
                allowedMimeTypes={['image/jpeg', 'image/png']}
              />
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Фото передаётся Pinduoduo для поиска. Поддерживаются JPEG и PNG до 500 КБ.</p>
            </div>
            <Button type="button" variant="secondary" disabled={!configured || pending || !images[0]} onClick={searchByPhoto} className="w-full lg:w-auto">
              {pending ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <ScanSearch data-icon="inline-start" />}
              Искать по фото
            </Button>
          </div>
          {notice && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{notice}</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {results.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Результаты Pinduoduo">
          {results.map((item) => {
            const isAdded = addedIds.includes(item.goodsId)
            return (
              <Card key={item.goodsId} className="overflow-hidden border-white/[0.07] bg-card/80 shadow-none">
                <div className="aspect-[4/3] overflow-hidden border-b border-white/[0.06] bg-white/[0.025]">
                  {item.imageUrl ? <img src={item.imageUrl} alt={item.name} loading="lazy" decoding="async" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-muted-foreground"><Package /></div>}
                </div>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="min-h-12">
                    <h3 className="line-clamp-2 text-sm font-medium leading-5">{item.name}</h3>
                    {item.sellerName && <p className="mt-1 truncate text-xs text-muted-foreground">{item.sellerName}</p>}
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <p className="font-semibold tabular-nums">{priceLabel(item.priceCny)}</p>
                    {item.salesHint && <p className="truncate text-right text-[11px] text-muted-foreground">{item.salesHint}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a href={item.productUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                      <ExternalLink data-icon="inline-start" />Источник
                    </a>
                    <Button type="button" size="sm" variant={isAdded ? 'secondary' : 'default'} disabled={pending || isAdded} onClick={() => addToReview(item)}>
                      {addingId === item.goodsId ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Plus data-icon="inline-start" />}
                      {isAdded ? 'В очереди' : 'Добавить в очередь'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </section>
  )
}
