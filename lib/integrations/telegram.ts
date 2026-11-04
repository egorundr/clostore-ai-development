import 'server-only'

import { getToken } from '@vercel/connect'

const TELEGRAM_CONNECTOR_UID = 'telegram/clostore-telegram-publishing'
const DEFAULT_TELEGRAM_CHAT_ID = '@clostorelink'

type TelegramMethod = 'getMe' | 'sendMessage' | 'sendPhoto' | 'sendMediaGroup'

async function getTelegramToken() {
  return getToken(TELEGRAM_CONNECTOR_UID, { subject: { type: 'app' } })
}

function getTelegramChatId() {
  return process.env.TELEGRAM_CHAT_ID?.trim() || DEFAULT_TELEGRAM_CHAT_ID
}

async function telegramRequest(method: TelegramMethod, body?: Record<string, unknown>) {
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

function getMessageId(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('result' in payload)) return null
  const result = payload.result
  const message = Array.isArray(result) ? result[0] : result
  if (!message || typeof message !== 'object' || !('message_id' in message)) return null
  const id = message.message_id
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
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

export async function sendTelegramPublication({ title, body, imageUrls }: { title: string; body: string; imageUrls: string[] }) {
  const caption = [title.trim(), body.trim(), 'Контакт: @clostorelink'].filter(Boolean).join('\n\n')
  const chatId = getTelegramChatId()

  if (imageUrls.length === 0) {
    return getMessageId(await telegramRequest('sendMessage', {
      chat_id: chatId,
      text: caption,
      disable_notification: false,
    }))
  }

  if (imageUrls.length === 1) {
    return getMessageId(await telegramRequest('sendPhoto', {
      chat_id: chatId,
      photo: imageUrls[0],
      caption,
    }))
  }

  const media = imageUrls.map((url, index) => ({
    type: 'photo',
    media: url,
    ...(index === 0 ? { caption } : {}),
  }))
  return getMessageId(await telegramRequest('sendMediaGroup', { chat_id: chatId, media }))
}
