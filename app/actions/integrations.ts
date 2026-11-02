'use server'

import { verifyAvitoConnection } from '@/lib/integrations/avito'
import { verifyTelegramConnection } from '@/lib/integrations/telegram'

export async function testTelegramConnection() {
  try {
    return { ok: true as const, message: await verifyTelegramConnection() }
  } catch {
    return { ok: false as const, message: 'Не удалось проверить Telegram. Проверьте TELEGRAM_BOT_TOKEN и доступность Bot API.' }
  }
}

export async function testAvitoConnection() {
  try {
    return { ok: true as const, message: await verifyAvitoConnection() }
  } catch {
    return { ok: false as const, message: 'Не удалось проверить Avito. Проверьте Client ID, Client Secret и доступ API для приложения.' }
  }
}
