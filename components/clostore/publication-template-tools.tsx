'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { createPublicationFromTemplate, deletePublicationTemplate, savePublicationTemplate } from '@/app/actions/publication-templates'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ImageUploadField } from './image-upload-field'
import type { PublicationTemplate, WorkspaceProduct } from '@/components/clostore/types'

type CreatedPublication = {
  id: string
  productId: string
  title: string
  body: string
  imageUrls: string[]
}

type PublicationTemplateToolsProps = {
  initialTemplates: PublicationTemplate[]
  products: WorkspaceProduct[]
  title: string
  body: string
  imageUrls: string[]
  onDraftCreated: (publication: CreatedPublication) => void
}

export function PublicationTemplateTools({ initialTemplates, products, title, body, imageUrls, onDraftCreated }: PublicationTemplateToolsProps) {
  const [templates, setTemplates] = useState(initialTemplates)
  const [templateName, setTemplateName] = useState('')
  const [imageTemplateUrl, setImageTemplateUrl] = useState('')
  const [templateId, setTemplateId] = useState(initialTemplates.find((template) => template.title.trim())?.id ?? '')
  const [productId, setProductId] = useState(products[0]?.id ?? '')
  const textTemplates = templates.filter((template) => template.title.trim())
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice('')
    setError('')
    startTransition(async () => {
      const result = await savePublicationTemplate({ name: templateName, title, body, imageUrls, imageTemplateUrl: imageTemplateUrl || null })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setTemplates((current) => [result.template, ...current.filter((template) => template.id !== result.template.id)])
      setTemplateId(result.template.title.trim() ? result.template.id : textTemplates[0]?.id ?? '')
      setTemplateName('')
      setImageTemplateUrl('')
      setNotice('Текст и изображение шаблона сохранены в Neon.')
    })
  }

  function createDraft() {
    if (!templateId || !productId) return
    setNotice('')
    setError('')
    startTransition(async () => {
      const result = await createPublicationFromTemplate({ templateId, productId })
      if (!result.ok) {
        setError(result.message)
        return
      }
      onDraftCreated(result.publication)
      setNotice('Черновик создан из шаблона. Проверьте текст перед публикацией.')
    })
  }

  function removeTemplate(id: string, name: string) {
    if (!window.confirm(`Удалить шаблон «${name}»? Сохранённые публикации не изменятся.`)) return
    setNotice('')
    setError('')
    startTransition(async () => {
      const result = await deletePublicationTemplate(id)
      if (!result.ok) {
        setError('Шаблон не найден или уже удалён.')
        return
      }
      const remaining = templates.filter((template) => template.id !== id)
      setTemplates(remaining)
      setTemplateId((current) => current === id ? remaining.find((template) => template.title.trim())?.id ?? '' : current)
      setNotice('Шаблон удалён.')
    })
  }

  return (
    <section className="mb-5 rounded-lg border border-white/[0.07] bg-white/[0.02] p-4" aria-labelledby="publication-templates-heading">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="publication-templates-heading" className="text-sm font-medium">Шаблоны объявлений</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Сохраняйте текст объявления и/или образец оформления фото.</p>
        </div>
        <span className="text-xs text-muted-foreground">{templates.length} сохранено</span>
      </div>

      <FieldGroup className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <Field>
          <FieldLabel htmlFor="publication-template-select">Шаблон</FieldLabel>
          <select id="publication-template-select" value={templateId} onChange={(event) => setTemplateId(event.target.value)} disabled={!textTemplates.length || pending} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Выберите шаблон</option>
            {textTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="publication-template-product">Товар из каталога</FieldLabel>
          <select id="publication-template-product" value={productId} onChange={(event) => setProductId(event.target.value)} disabled={!products.length || pending} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Выберите товар</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </Field>
        <Button type="button" onClick={createDraft} disabled={!templateId || !productId || pending}>
          {pending ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Plus data-icon="inline-start" />}
          Создать черновик
        </Button>
      </FieldGroup>

      <form onSubmit={saveTemplate} className="mt-4 grid gap-3 border-t border-white/[0.06] pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field>
          <FieldLabel htmlFor="publication-template-name">Название текстового и/или визуального шаблона</FieldLabel>
          <Input id="publication-template-name" value={templateName} onChange={(event) => setTemplateName(event.target.value)} maxLength={80} placeholder="Например, базовая карточка товара" />
        </Field>
        <Button type="submit" variant="outline" disabled={pending || !templateName.trim() || (!title.trim() && !imageTemplateUrl)}>
          <Plus data-icon="inline-start" />Сохранить шаблон
        </Button>
        <ImageUploadField
          id="publication-template-image"
          label="Шаблон оформления фото для агента (необязательно)"
          value={imageTemplateUrl ? [imageTemplateUrl] : []}
          onChange={(urls) => setImageTemplateUrl(urls[0] ?? '')}
          maxImages={1}
          previewAltLabel="Изображение-шаблон"
          className="sm:col-span-2"
        />
      </form>
      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">Переменные: {'{{productName}}'}, {'{{category}}'}, {'{{price}}'}, {'{{sizes}}'}, {'{{description}}'}. Фото товара подставляются из каталога автоматически. Загруженный шаблон можно выбрать в агенте для оформления фото.</p>
      {templates.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{templates.map((template) => <Button key={template.id} type="button" size="xs" variant="ghost" disabled={pending} onClick={() => removeTemplate(template.id, template.name)} aria-label={`Удалить шаблон ${template.name}`}><Trash2 data-icon="inline-start" />{template.name}</Button>)}</div>}
      {notice && <p role="status" className="mt-3 text-xs text-emerald-200">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
    </section>
  )
}
