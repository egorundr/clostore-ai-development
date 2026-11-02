import 'server-only'

function getTelegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim()
  if (!token || !chatId) throw new Error('Telegram configuration is incomplete')
  return { token, chatId }
}

export async function verifyTelegramConnection() {
  const { token } = getTelegramConfig()
  const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok || !payload || typeof payload !== 'object' || !('ok' in payload) || payload.ok !== true) {
    throw new Error('Telegram connection check failed')
  }
  const result = 'result' in payload ? payload.result : null
  const username = result && typeof result === 'object' && 'username' in result && typeof result.username === 'string' ? result.username : null
  return username ? `Связь проверена: @${username}` : 'Связь с Telegram проверена.'
}

export async function sendTelegramMessage(text: string) {
  const content = text.trim()
  if (!content || content.length > 4000) throw new Error('Telegram message must contain 1–4000 characters')
  const { token, chatId } = getTelegramConfig()
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: content, disable_notification: false }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok || !payload || typeof payload !== 'object' || !('ok' in payload) || payload.ok !== true) {
    throw new Error('Telegram message could not be sent')
  }
}
