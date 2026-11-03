'use server'

import { verifyTelegramConnection } from '@/lib/integrations/telegram'

export async function testTelegramConnection() {
  try {
    return { ok: true as const, message: await verifyTelegramConnection() }
  } catch {
    return { ok: false as const, message: 'Не удалось проверить Telegram через Vercel Connect. Проверьте подключение бота и доступность Bot API.' }
  }
}
