import 'server-only'

import type { IntegrationStatus } from '@/components/clostore/types'

function isConfigured(...keys: string[]) {
  return keys.every((key) => Boolean(process.env[key]?.trim()))
}

export function getIntegrationStatuses(): IntegrationStatus[] {
  const telegramConfigured = isConfigured('TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID')
  const avitoConfigured = isConfigured('AVITO_CLIENT_ID', 'AVITO_CLIENT_SECRET')

  return [
    {
      name: 'Neon',
      detail: 'Каталог, заказы, поставщики и история AI-задач хранятся в Neon.',
      state: isConfigured('DATABASE_URL') ? 'Переменная настроена' : 'Нужен DATABASE_URL',
      configured: isConfigured('DATABASE_URL'),
      requiredVariables: ['DATABASE_URL'],
    },
    {
      name: 'Vercel AI Gateway',
      detail: 'Подключён к проекту; вызовы выполняются только на сервере.',
      state: 'Подключён',
      configured: true,
      requiredVariables: [],
    },
    {
      name: 'DeepSeek API',
      detail: 'Модель deepseek/deepseek-v4.1-flash вызывается через подключённый AI Gateway.',
      state: 'Готов',
      configured: true,
      requiredVariables: [],
    },
    {
      name: 'Telegram Bot API',
      detail: telegramConfigured ? 'Переменные заданы; после добавления адаптера потребуется проверить связь.' : 'Для будущего адаптера нужны токен бота и целевой чат.',
      state: telegramConfigured ? 'Параметры заданы · связь не проверена' : 'Ожидает настройки',
      configured: telegramConfigured,
      requiredVariables: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
    },
    {
      name: 'Avito API',
      detail: avitoConfigured ? 'OAuth-параметры заданы; после добавления адаптера потребуется проверить авторизацию.' : 'Для будущего OAuth-адаптера нужны Client ID и Client Secret.',
      state: avitoConfigured ? 'Параметры заданы · связь не проверена' : 'Ожидает настройки',
      configured: avitoConfigured,
      requiredVariables: ['AVITO_CLIENT_ID', 'AVITO_CLIENT_SECRET'],
    },
    {
      name: 'Источники поиска',
      detail: 'Коннекторы официальных API подключаются отдельно для каждого источника; парсинг не выполняется.',
      state: 'Адаптеры не выбраны',
      configured: false,
      requiredVariables: [],
    },
  ]
}
