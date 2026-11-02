'use client'

import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'

export function AuthForm() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '').trim().toLowerCase()
    const password = String(formData.get('password') ?? '')
    setPending(true)
    setError('')

    try {
      const result = await authClient.signIn.email({ email, password })

      if (result.error) {
        setError('Не удалось выполнить вход. Проверьте данные и попробуйте ещё раз.')
        return
      }

      router.replace('/')
      router.refresh()
    } catch {
      setError('Не удалось выполнить вход. Попробуйте ещё раз позже.')
    } finally {
      setPending(false)
    }
  }

  function guardImeSubmit(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) {
      event.preventDefault()
    }
  }

  return (
    <Card className="w-full max-w-md border-white/10 bg-card/90 shadow-2xl">
      <CardHeader>
        <CardTitle className="text-2xl">Войти в CloStore AI</CardTitle>
        <CardDescription>Войдите, чтобы открыть рабочее пространство магазина.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} onKeyDown={guardImeSubmit} className="flex flex-col gap-5">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="auth-email">Электронная почта</FieldLabel>
              <Input id="auth-email" name="email" type="email" autoComplete="email" maxLength={254} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="auth-password">Пароль</FieldLabel>
              <Input id="auth-password" name="password" type="password" autoComplete="current-password" minLength={12} maxLength={128} required />
            </Field>
          </FieldGroup>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Подождите…' : 'Войти'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
