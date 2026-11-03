import 'server-only'

import type { IntegrationStatus } from '@/components/clostore/types'

function isConfigured(...keys: string[]) {
  return keys.every((key) => Boolean(process.env[key]?.trim()))
}

export function getIntegrationStatuses(): IntegrationStatus[] {
  const telegramConfigured = true

  return [
    {
      name: 'Neon',
      detail: 'Каталог, заказы, поставщики и история AI-задач хранятся в Neon.',
      state: isConfigured('DATABASE_URL') ? 'Переменная настроена' : 'Нужен DATABASE_URL',
      configured: isConfigured('DATABASE_URL'),
      requiredVariables: ['DATABASE_URL'],
      testProvider: null,
    },
    {
      name: 'DeepSeek API',
      detail: 'Запросы к DeepSeek выполняются на сервере; ключ читается из переменных окружения и не сохраняется в браузере.',
      state: isConfigured('DEEPSEEK_API_KEY') ? `Готов · ${process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-flash'}` : 'Нужен серверный API-ключ',
      configured: isConfigured('DEEPSEEK_API_KEY'),
      requiredVariables: ['DEEPSEEK_API_KEY'],
      testProvider: null,
    },
    {
      name: 'Telegram Bot API',
      detail: `Токен бота управляется через Vercel Connect. Публикации направляются в @clostorelink${process.env.TELEGRAM_CHAT_ID?.trim() ? ' или в адрес из TELEGRAM_CHAT_ID' : ''}.`,
      state: 'Получатель настроен',
      configured: telegramConfigured,
      requiredVariables: [],
      testProvider: 'telegram',
    },
    {
      name: 'Pinduoduo Open API',
      detail: 'Поиск товаров и поиск по фото выполняются через API; обход сайта и автоматический скрейпинг не используются.',
      state: isConfigured('PINDUODUO_CLIENT_ID', 'PINDUODUO_CLIENT_SECRET') ? 'Ключи API настроены' : 'Нужны ключи Open API',
      configured: isConfigured('PINDUODUO_CLIENT_ID', 'PINDUODUO_CLIENT_SECRET'),
      requiredVariables: ['PINDUODUO_CLIENT_ID', 'PINDUODUO_CLIENT_SECRET'],
      testProvider: null,
    },
    {
      name: 'Источники поиска',
      detail: 'Pinduoduo подключается через Open API; другие площадки открываются отдельно и не сканируются автоматически.',
      state: 'Ручной доступ для остальных источников',
      configured: false,
      requiredVariables: [],
      testProvider: null,
    },
  ]
}
