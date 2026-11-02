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
      detail: telegramConfigured ? 'Модуль getMe/sendMessage готов; проверку связи можно запустить ниже. Интерфейс публикации ещё не подключён.' : 'Модуль getMe/sendMessage готов; добавьте токен и целевой чат для проверки связи.',
      state: telegramConfigured ? 'Параметры заданы · связь не проверена' : 'Ожидает настройки',
      configured: telegramConfigured,
      requiredVariables: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
      testProvider: 'telegram',
    },
    {
      name: 'Avito API',
      detail: avitoConfigured ? 'OAuth-модуль получает токен и проверяет профиль; публикация требует одобренных методов API и отдельного интерфейса.' : 'OAuth-модуль готов; добавьте Client ID и Client Secret для проверки профиля.',
      state: avitoConfigured ? 'Параметры заданы · связь не проверена' : 'Ожидает настройки',
      configured: avitoConfigured,
      requiredVariables: ['AVITO_CLIENT_ID', 'AVITO_CLIENT_SECRET'],
      testProvider: 'avito',
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
