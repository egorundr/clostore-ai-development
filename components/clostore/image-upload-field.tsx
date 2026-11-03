'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { upload } from '@vercel/blob/client'
import { ImagePlus, LoaderCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'

const MAX_IMAGES = 10
const MAX_IMAGE_SIZE = 8 * 1024 * 1024
const FILE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

interface ImageUploadFieldProps {
  id: string
  label: string
  value: string[]
  onChange: (urls: string[]) => void
  name?: string
  className?: string
  maxImages?: number
  maxImageSizeBytes?: number
  allowedMimeTypes?: string[]
}

export function ImageUploadField({
  id,
  label,
  value,
  onChange,
  name,
  className,
  maxImages = MAX_IMAGES,
  maxImageSizeBytes = MAX_IMAGE_SIZE,
  allowedMimeTypes = Object.keys(FILE_EXTENSIONS),
}: ImageUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const maxSizeLabel = maxImageSizeBytes < 1024 * 1024
    ? `${Math.floor(maxImageSizeBytes / 1024)} КБ`
    : `${Math.floor(maxImageSizeBytes / (1024 * 1024))} МБ`
  const allowedFormatLabel = allowedMimeTypes.map((type) => ({ 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP' }[type] ?? type)).join(', ')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const files = Array.from(input.files ?? [])
    if (!files.length) return

    if (files.length > maxImages - value.length) {
      setError(`Можно добавить не больше ${maxImages} фотографий.`)
      input.value = ''
      return
    }

    const invalidFile = files.find((file) => !allowedMimeTypes.includes(file.type) || file.size > maxImageSizeBytes)
    if (invalidFile) {
      setError(`Поддерживаются ${allowedFormatLabel}; размер — до ${maxSizeLabel} каждый.`)
      input.value = ''
      return
    }

    setError('')
    setUploading(true)
    let nextValue = value

    try {
      for (const [index, file] of files.entries()) {
        const extension = FILE_EXTENSIONS[file.type]
        if (!extension || !allowedMimeTypes.includes(file.type)) throw new Error('Unsupported image type')
        const blob = await upload(`clostore/images/${crypto.randomUUID()}.${extension}`, file, {
          access: 'public',
          handleUploadUrl: '/api/uploads/images',
          contentType: file.type,
          onUploadProgress: ({ percentage }) => {
            setProgress(Math.round(((index + percentage / 100) / files.length) * 100))
          },
        })
        nextValue = [...nextValue, blob.url]
        onChange(nextValue)
      }
    } catch {
      setError('Не удалось загрузить фотографию. Проверьте подключение и попробуйте ещё раз.')
    } finally {
      setUploading(false)
      setProgress(null)
      input.value = ''
    }
  }

  function updateUrls(raw: string) {
    const urls = [...new Set(raw.split(/\r?\n/).map((url) => url.trim()).filter(Boolean))]
    if (urls.length > maxImages) {
      setError(`Можно добавить не больше ${maxImages} фотографий.`)
      return
    }
    setError('')
    onChange(urls)
  }

  function removeImage(urlToRemove: string) {
    onChange(value.filter((url) => url !== urlToRemove))
    setError('')
  }

  return (
    <Field className={className}>
      <FieldLabel htmlFor={`${id}-urls`}>{label}</FieldLabel>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          id={`${id}-files`}
          type="file"
          accept={allowedMimeTypes.join(',')}
          multiple={maxImages > 1}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={handleFilesChange}
        />
        <Button type="button" variant="outline" size="sm" disabled={uploading || value.length >= maxImages} onClick={() => fileInputRef.current?.click()}>
          {uploading ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <ImagePlus data-icon="inline-start" />}
          {uploading ? `Загружаю ${progress ?? 0}%` : 'Загрузить фото'}
        </Button>
        <p className="text-xs text-muted-foreground">{allowedFormatLabel} · до {maxSizeLabel} · максимум {maxImages}</p>
      </div>
      {name && <input type="hidden" name={name} value={value.join('\n')} />}
      <Textarea
        id={`${id}-urls`}
        value={value.join('\n')}
        onChange={(event) => updateUrls(event.target.value)}
        maxLength={20000}
        rows={3}
        disabled={uploading}
        placeholder="Или вставьте публичные HTTPS-ссылки, по одной на строку"
      />
      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Предпросмотр фотографий">
          {value.map((url, index) => (
            <div key={`${url}-${index}`} className="group relative aspect-square overflow-hidden rounded-md border border-white/10 bg-background">
              <img src={url} alt={`Фото товара ${index + 1}`} loading="lazy" decoding="async" className="size-full object-cover" />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute right-1 top-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                disabled={uploading}
                aria-label={`Удалить фото ${index + 1}`}
                onClick={() => removeImage(url)}
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {uploading && <p role="status" aria-live="polite" className="text-xs text-muted-foreground">Загрузка фотографий в Vercel Blob…</p>}
    </Field>
  )
}
