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
      name: 'Vercel AI Gateway',
      detail: 'Подключён к проекту; вызовы выполняются только на сервере.',
      state: 'Подключён',
      configured: true,
      requiredVariables: [],
      testProvider: null,
    },
    {
      name: 'DeepSeek API',
      detail: 'Модель deepseek/deepseek-v4.1-flash вызывается через подключённый AI Gateway.',
      state: 'Готов',
      configured: true,
      requiredVariables: [],
      testProvider: null,
    },
    {
      name: 'Telegram Bot API',
      detail: 'Токен бота управляется через Vercel Connect. Для публикаций потребуется указать TELEGRAM_CHAT_ID.',
      state: process.env.TELEGRAM_CHAT_ID?.trim() ? 'Подключён · получатель задан' : 'Подключён · получатель не задан',
      configured: telegramConfigured,
      requiredVariables: ['TELEGRAM_CHAT_ID'],
      testProvider: 'telegram',
    },
    {
      name: 'Источники поиска',
      detail: 'Коннекторы официальных API подключаются отдельно для каждого источника; парсинг не выполняется.',
      state: 'Адаптеры не выбраны',
      configured: false,
      requiredVariables: [],
      testProvider: null,
    },
  ]
}
