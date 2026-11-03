'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, ImagePlus, LoaderCircle, WandSparkles, X } from 'lucide-react'
import { prepareProductListingPhotos, savePreparedProductPhotos } from '@/app/actions/product-photos'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import type { PublicationTemplate, SectionId, WorkspaceProduct } from '@/components/clostore/types'

type PreparedPhoto = { sourceUrl: string; imageUrl: string }

type ProductPhotoPreparationProps = {
  products: WorkspaceProduct[]
  templates: PublicationTemplate[]
  onNavigate: (section: SectionId) => void
}

export function ProductPhotoPreparation({ products, templates, onNavigate }: ProductPhotoPreparationProps) {
  const router = useRouter()
  const [productId, setProductId] = useState(() => products.find((product) => product.images.length)?.id ?? products[0]?.id ?? '')
  const [templateId, setTemplateId] = useState('white')
  const [photos, setPhotos] = useState<PreparedPhoto[]>([])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  const product = products.find((item) => item.id === productId)
  const imageTemplates = templates.filter((template) => template.imageTemplateUrl)
  const selectedTemplate = imageTemplates.find((template) => template.id === templateId)
  const sourceImages = product?.images.slice(0, 3) ?? []

  function resetPreview() {
    setPhotos([])
    setNotice('')
    setError('')
    setSaved(false)
  }

  function preparePhotos() {
    if (!productId || pending) return
    setNotice('')
    setError('')
    setPhotos([])
    setSaved(false)
    startTransition(async () => {
      try {
        const result = await prepareProductListingPhotos({ productId, templateId: templateId === 'white' ? null : templateId })
        if (!result.ok) {
          setError(result.message)
          return
        }
        setPhotos(result.photos)
        setNotice(result.failedCount ? `Подготовлено ${result.photos.length}. Не удалось обработать: ${result.failedCount}.` : 'Фото готовы. Проверьте результат перед сохранением.')
      } catch {
        setError('Не удалось подготовить фото. Попробуйте ещё раз позже.')
      }
    })
  }

  function savePhotos() {
    if (!productId || !photos.length || pending || saved) return
    setNotice('')
    setError('')
    startTransition(async () => {
      try {
        const result = await savePreparedProductPhotos({ productId, imageUrls: photos.map((photo) => photo.imageUrl) })
        if (!result.ok) {
          setError(result.message)
          return
        }
        setSaved(true)
        setNotice(`В карточку добавлено фото: ${result.imageCount}. Исходные фотографии сохранены.`)
        router.refresh()
      } catch {
        setError('Не удалось сохранить фото в карточку. Проверьте каталог и повторите попытку.')
      }
    })
  }

  return (
    <Card className="border-white/[0.07] bg-card/80 shadow-none">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-300/[0.06] text-emerald-100"><ImagePlus /></span>
          <div className="min-w-0"><CardTitle>Фото для объявления</CardTitle><p className="mt-1 text-xs text-muted-foreground">Подготовка прямо из карточки товара</p></div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {products.length ? <>
          <FieldGroup className="gap-3">
            <Field>
              <FieldLabel htmlFor="photo-prep-product">Товар</FieldLabel>
              <select id="photo-prep-product" value={productId} disabled={pending} onChange={(event) => { setProductId(event.target.value); resetPreview() }} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                {products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="photo-prep-template">Оформление фото</FieldLabel>
              <select id="photo-prep-template" value={templateId} disabled={pending} onChange={(event) => { setTemplateId(event.target.value); resetPreview() }} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="white">Чистый белый фон</option>
                {imageTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </Field>
          </FieldGroup>

          {selectedTemplate?.imageTemplateUrl && <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-background">
            <img src={selectedTemplate.imageTemplateUrl} alt={`Шаблон оформления: ${selectedTemplate.name}`} loading="lazy" decoding="async" className="max-h-40 w-full object-contain" />
            <p className="border-t border-white/[0.06] px-3 py-2 text-[11px] text-muted-foreground">Шаблон будет передан как образец оформления</p>
          </div>}

          {product?.images.length ? <>
            <div>
              <p className="mb-2 text-xs font-medium">Исходные фото</p>
              <div className="grid grid-cols-3 gap-2">
                {sourceImages.map((url, index) => <div key={`${url}-${index}`} className="aspect-square overflow-hidden rounded-md border border-white/10 bg-background"><img src={url} alt={`${product.name}, исходное фото ${index + 1}`} loading="lazy" decoding="async" className="size-full object-cover" /></div>)}
              </div>
              <p className="mt-2 text-[11px] leading-4 text-muted-foreground">Обработаются первые {sourceImages.length} фото, максимум за один запуск — 3.</p>
            </div>
          </> : <p className="rounded-md border border-dashed border-white/10 px-3 py-4 text-xs leading-5 text-muted-foreground">В выбранной карточке пока нет фотографий. Сначала добавьте фото в каталоге.</p>}

          {!imageTemplates.length && <div className="rounded-md border border-white/[0.07] bg-white/[0.02] p-3">
            <p className="text-xs leading-5 text-muted-foreground">Загрузите шаблон в разделе «Telegram» → «Шаблоны объявлений». Название можно сохранить без текста объявления.</p>
            <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => onNavigate('telegram')}><ArrowRight data-icon="inline-start" />Открыть Telegram</Button>
          </div>}

          <Button type="button" onClick={preparePhotos} disabled={pending || !product?.images.length}>
            {pending && !photos.length ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <WandSparkles data-icon="inline-start" />}
            {pending && !photos.length ? 'Готовлю фото…' : 'Подготовить фото'}
          </Button>

          {photos.length > 0 && <div className="flex flex-col gap-3 border-t border-white/[0.06] pt-4">
            <div>
              <p className="text-xs font-medium">Предпросмотр результата</p>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Проверьте товар и надписи шаблона: генерация может изменить мелкие детали.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {photos.map((photo, index) => <div key={`${photo.imageUrl}-${index}`} className="overflow-hidden rounded-md border border-white/10 bg-background">
                <img src={photo.imageUrl} alt={`${product?.name ?? 'Товар'}, подготовленное фото ${index + 1}`} loading="lazy" decoding="async" className="aspect-square w-full object-cover" />
                <p className="px-2 py-1.5 text-[10px] text-muted-foreground">Фото {index + 1}</p>
              </div>)}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={savePhotos} disabled={pending || saved}>
                {saved ? <Check data-icon="inline-start" /> : pending ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <ImagePlus data-icon="inline-start" />}
                {saved ? 'Сохранено в карточке' : pending ? 'Сохраняю…' : 'Добавить фото в карточку'}
              </Button>
              <Button type="button" variant="ghost" disabled={pending} onClick={() => { setPhotos([]); setNotice(''); setError(''); setSaved(false) }}><X data-icon="inline-start" />Отменить</Button>
            </div>
          </div>}

          {notice && <p role="status" className="text-xs leading-5 text-emerald-200">{notice}</p>}
          {error && <p role="alert" className="text-xs leading-5 text-destructive">{error}</p>}
          <p className="text-[11px] leading-4 text-muted-foreground">Исходные фото не заменяются. Результат попадёт в карточку только после вашей проверки и нажатия кнопки.</p>
        </> : <div className="flex flex-col gap-3 rounded-lg border border-dashed border-white/10 p-4 text-center">
          <p className="text-sm font-medium">В каталоге пока нет товаров</p>
          <p className="text-xs leading-5 text-muted-foreground">Добавьте карточку с фото — агент подготовит изображения для объявления.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => onNavigate('catalog')}>Открыть каталог</Button>
        </div>}
      </CardContent>
    </Card>
  )
}
