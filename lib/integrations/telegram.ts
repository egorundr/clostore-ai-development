import 'server-only'

import { getToken } from '@vercel/connect'

const TELEGRAM_CONNECTOR_UID = 'telegram/clostore-telegram-publishing'

async function getTelegramToken() {
  return getToken(TELEGRAM_CONNECTOR_UID, { subject: { type: 'app' } })
}

function getTelegramChatId() {
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim()
  if (!chatId) throw new Error('Telegram destination is not configured')
  return chatId
}

async function telegramRequest(method: 'getMe' | 'sendMessage', body?: Record<string, string | boolean>) {
  const token = await getTelegramToken()
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    ...(body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok || !payload || typeof payload !== 'object' || !('ok' in payload) || payload.ok !== true) {
    throw new Error(`Telegram ${method} request failed`)
  }
  return payload
}

export async function verifyTelegramConnection() {
  const payload = await telegramRequest('getMe')
  const result = 'result' in payload ? payload.result : null
  const username = result && typeof result === 'object' && 'username' in result && typeof result.username === 'string' ? result.username : null
  return username ? `Связь проверена: @${username}` : 'Связь с Telegram проверена.'
}

export async function sendTelegramMessage(text: string) {
  const content = text.trim()
  if (!content || content.length > 4000) throw new Error('Telegram message must contain 1–4000 characters')
  await telegramRequest('sendMessage', {
    chat_id: getTelegramChatId(),
    text: content,
    disable_notification: false,
  })
}
