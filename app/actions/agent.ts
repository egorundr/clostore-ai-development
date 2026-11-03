'use server'

import { randomUUID } from 'node:crypto'
import { and, count, desc, eq, gte, ilike, or, sql } from 'drizzle-orm'
import { ToolLoopAgent, gateway, isStepCount, tool } from 'ai'
import { z } from 'zod'
import { db } from '@/lib/db'
import { agentTasks, orders, products } from '@/lib/db/schema'
import { getPersonalWorkspaceUserId } from '@/lib/personal-workspace'
import type { AgentTaskPreview } from '@/components/clostore/types'

const MODEL_ID = 'deepseek/deepseek-v4.1-flash'
const MAX_PROMPT_LENGTH = 4000
const HISTORY_LIMIT = 20
const MAX_TASKS_PER_HOUR = 10

export async function getAgentTasks(): Promise<AgentTaskPreview[]> {
  const userId = await getPersonalWorkspaceUserId()
  const rows = await db.select({
    id: agentTasks.id,
    prompt: agentTasks.prompt,
    response: agentTasks.response,
    status: agentTasks.status,
    model: agentTasks.model,
    inputTokens: agentTasks.inputTokens,
    outputTokens: agentTasks.outputTokens,
    createdAt: agentTasks.createdAt,
  }).from(agentTasks)
    .where(eq(agentTasks.userId, userId))
    .orderBy(desc(agentTasks.createdAt))
    .limit(HISTORY_LIMIT)

  return rows.map((row) => ({
    ...row,
    status: row.status as AgentTaskPreview['status'],
    inputTokens: row.inputTokens == null ? null : Number(row.inputTokens),
    outputTokens: row.outputTokens == null ? null : Number(row.outputTokens),
    createdAt: row.createdAt.toISOString(),
  }))
}

export async function runAgentTask(rawPrompt: string) {
  if (typeof rawPrompt !== 'string') return { ok: false as const, reason: 'invalid_input' as const }
  const prompt = rawPrompt.trim()
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
    return { ok: false as const, reason: 'invalid_input' as const }
  }

  const userId = await getPersonalWorkspaceUserId()
  const taskId = randomUUID()
  const canStartTask = await db.transaction(async (transaction) => {
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId})::bigint)`)
    const [recentTasks] = await transaction.select({ total: count() }).from(agentTasks)
      .where(and(eq(agentTasks.userId, userId), gte(agentTasks.createdAt, new Date(Date.now() - 60 * 60 * 1000))))
    if (recentTasks.total >= MAX_TASKS_PER_HOUR) return false

    await transaction.insert(agentTasks).values({
      id: taskId,
      userId,
      prompt,
      response: '',
      status: 'running',
      model: MODEL_ID,
    })
    return true
  })
  if (!canStartTask) return { ok: false as const, reason: 'rate_limited' as const }

  try {
    const agent = new ToolLoopAgent({
      model: gateway(MODEL_ID),
      instructions: [
        'Ты — AI-помощник личного fashion-магазина CloStore. Отвечай по-русски, структурно и кратко.',
        'Для вопросов о товарах и заказах используй соответствующий инструмент и отвечай только на основе его результатов. Если результатов нет — скажи об этом.',
        'Инструменты показывают данные только этого личного пространства. Не запрашивай и не раскрывай контакты покупателей.',
        'Интернет-поиск, Telegram, закупки, создание заказов и любые изменения данных недоступны. Не утверждай, что выполнил такие действия.',
        'Не выдумывай цены, наличие, курсы валют, характеристики товара и сведения о поставщиках. Для расчётов запрашивай недостающие исходные данные и показывай формулу.',
      ].join('\n'),
      stopWhen: isStepCount(6),
      maxOutputTokens: 1200,
      tools: {
        searchCatalog: tool({
          description: 'Найти товары в личном каталоге CloStore по названию и необязательному статусу. Используй для вопросов о сохранённых товарах.',
          inputSchema: z.object({
            query: z.string().trim().max(120).optional().describe('Часть названия или категории товара'),
            status: z.enum(['active', 'review', 'draft', 'rejected']).optional().describe('Фильтр по внутреннему статусу товара'),
            limit: z.number().int().min(1).max(12).default(8),
          }),
          execute: async ({ query, status, limit }) => {
            const filters = [eq(products.userId, userId)]
            const normalizedQuery = query?.trim()
            if (normalizedQuery) filters.push(or(
              ilike(products.name, `%${normalizedQuery}%`),
              ilike(products.category, `%${normalizedQuery}%`),
            )!)
            if (status) filters.push(eq(products.status, status))

            const rows = await db.select({
              name: products.name,
              category: products.category,
              source: products.source,
              purchasePriceRub: products.purchasePriceRub,
              salePriceRub: products.salePriceRub,
              sizes: products.sizes,
              status: products.status,
            }).from(products)
              .where(and(...filters))
              .orderBy(desc(products.createdAt))
              .limit(limit)

            return rows.map((row) => {
              const purchasePriceRub = Number(row.purchasePriceRub)
              const salePriceRub = Number(row.salePriceRub)
              return {
                name: row.name,
                category: row.category,
                source: row.source,
                purchasePriceRub,
                salePriceRub,
                grossMarginRub: Math.round((salePriceRub - purchasePriceRub) * 100) / 100,
                sizes: row.sizes,
                status: row.status,
              }
            })
          },
        }),
        listOrders: tool({
          description: 'Показать личные заказы по статусу заказа, этапу доставки или названию товара. Для вопроса о посылках в пути используй этап доставки. Не возвращает имена и контакты покупателей.',
          inputSchema: z.object({
            productQuery: z.string().trim().max(120).optional().describe('Часть названия товара'),
            status: z.enum(['Ожидает оплаты', 'Ожидает закупки', 'Заказан у поставщика', 'В пути', 'Прибыл', 'Завершён', 'Отменён', 'Проблема / возврат']).optional(),
            deliveryStatus: z.enum(['Не отправлен', 'В пути по Китаю', 'Международная доставка', 'Прибыл', 'Передан покупателю', 'Проблема']).optional().describe('Фильтр по статусу доставки, например «Международная доставка»'),
            limit: z.number().int().min(1).max(12).default(8),
          }),
          execute: async ({ productQuery, status, deliveryStatus, limit }) => {
            const filters = [eq(orders.userId, userId)]
            const normalizedQuery = productQuery?.trim()
            if (normalizedQuery) filters.push(ilike(orders.productName, `%${normalizedQuery}%`))
            if (status) filters.push(eq(orders.status, status))
            if (deliveryStatus) filters.push(eq(orders.deliveryStatus, deliveryStatus))

            const rows = await db.select({
              productName: orders.productName,
              size: orders.size,
              quantity: orders.quantity,
              status: orders.status,
              paymentStatus: orders.paymentStatus,
              procurementStatus: orders.procurementStatus,
              deliveryStatus: orders.deliveryStatus,
              salePriceRub: orders.salePriceRub,
              costRub: orders.costRub,
              createdAt: orders.createdAt,
            }).from(orders)
              .where(and(...filters))
              .orderBy(desc(orders.createdAt))
              .limit(limit)

            return rows.map((row) => ({
              ...row,
              salePriceRub: Number(row.salePriceRub),
              costRub: Number(row.costRub),
              createdAt: row.createdAt.toISOString(),
            }))
          },
        }),
      },
    })

    const result = await agent.generate({
      prompt,
      abortSignal: AbortSignal.timeout(45_000),
    })
    const usedTools = [...new Set(result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName)))]
    const toolLabels: Record<string, string> = { searchCatalog: 'каталог', listOrders: 'заказы' }
    const response = [
      result.text || 'Данные проверены. Уточни, какой результат показать.',
      usedTools.length ? `\n\nПроверено по данным приложения: ${usedTools.map((name) => toolLabels[name] ?? name).join(', ')}.` : '',
    ].join('')

    const inputTokens = result.usage.inputTokens ?? null
    const outputTokens = result.usage.outputTokens ?? null
    await db.update(agentTasks).set({
      response,
      status: 'completed',
      inputTokens,
      outputTokens,
      updatedAt: new Date(),
    }).where(and(eq(agentTasks.id, taskId), eq(agentTasks.userId, userId)))

    return {
      ok: true as const,
      task: {
        id: taskId,
        prompt,
        response,
        status: 'completed' as const,
        model: MODEL_ID,
        inputTokens,
        outputTokens,
        createdAt: new Date().toISOString(),
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const reason = /credit card/i.test(message) ? 'gateway_billing_required' : 'provider_unavailable'
    await db.update(agentTasks).set({ status: 'failed', updatedAt: new Date() })
      .where(and(eq(agentTasks.id, taskId), eq(agentTasks.userId, userId)))
      .catch(() => undefined)
    return { ok: false as const, reason }
  }
}
