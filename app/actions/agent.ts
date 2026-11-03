'use server'

import { randomUUID } from 'node:crypto'
import { and, count, desc, eq, gte, ilike, inArray, or, sql } from 'drizzle-orm'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { ToolLoopAgent, isStepCount, tool, type ModelMessage, type ToolApprovalResponse } from 'ai'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { agentTasks, financialTransactions, orderStatusHistory, orders, products, suppliers } from '@/lib/db/schema'
import { getPersonalWorkspaceUserId } from '@/lib/personal-workspace'
import type { AgentPendingApproval, AgentTaskPreview } from '@/components/clostore/types'

const MODEL_ID = process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-flash'
const MAX_PROMPT_LENGTH = 4000
const HISTORY_LIMIT = 20
const MAX_TASKS_PER_HOUR = 10
const MAX_AGENT_STEPS = 6

const approvalSchema = z.object({
  approvalId: z.string().min(1).max(200),
  toolName: z.enum(['createProductDraft', 'updateProductCard', 'updateOrderStatus', 'recordExpense']),
  input: z.record(z.string(), z.unknown()),
  reason: z.string().max(500).optional(),
})

const storedResponseSchema = z.object({
  format: z.literal('clostore-agent-v1'),
  text: z.string(),
  messages: z.array(z.unknown()),
  pendingApprovals: z.array(approvalSchema),
})

type StoredAgentResponse = {
  format: 'clostore-agent-v1'
  text: string
  messages: ModelMessage[]
  pendingApprovals: AgentPendingApproval[]
}

function serializeResponse(response: StoredAgentResponse) {
  return JSON.stringify(response)
}

function parseResponse(value: string): StoredAgentResponse {
  try {
    const result = storedResponseSchema.safeParse(JSON.parse(value))
    if (result.success) {
      return {
        ...result.data,
        messages: result.data.messages as ModelMessage[],
        pendingApprovals: result.data.pendingApprovals as AgentPendingApproval[],
      }
    }
  } catch {
    // Older task rows store the response as plain text.
  }

  return { format: 'clostore-agent-v1', text: value, messages: [], pendingApprovals: [] }
}

function responseForResult(result: Awaited<ReturnType<ReturnType<typeof createAgent>['generate']>>, messages: ModelMessage[]): StoredAgentResponse {
  const pendingApprovals = result.content.flatMap((part) => {
    if (part.type !== 'tool-approval-request' || part.isAutomatic) return []
    const toolCall = part.toolCall
    if (!['createProductDraft', 'updateProductCard', 'updateOrderStatus', 'recordExpense'].includes(toolCall.toolName)) return []
    if (!toolCall.input || typeof toolCall.input !== 'object' || Array.isArray(toolCall.input)) return []

    return [{
      approvalId: part.approvalId,
      toolName: toolCall.toolName as AgentPendingApproval['toolName'],
      input: toolCall.input as Record<string, unknown>,
      ...(part.reason ? { reason: part.reason } : {}),
    }]
  })
  const usedTools = [...new Set(result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName)))]
  const labels: Record<string, string> = {
    searchCatalog: 'каталог',
    listSuppliers: 'поставщики',
    listOrders: 'заказы',
    getFinancialSummary: 'финансовые показатели',
    createProductDraft: 'черновик товара',
    updateProductCard: 'карточки товаров',
    updateOrderStatus: 'статус заказа',
    recordExpense: 'расходы',
  }
  const suffix = usedTools.length
    ? `\n\nПроверено по данным приложения: ${usedTools.map((name) => labels[name] ?? name).join(', ')}.`
    : ''
  const text = result.text.trim() || (pendingApprovals.length
    ? 'Подготовил действие. Проверьте детали и подтвердите его ниже, чтобы продолжить.'
    : 'Задача выполнена.')

  return {
    format: 'clostore-agent-v1',
    text: `${text}${suffix}`,
    messages: [...messages, ...result.responseMessages],
    pendingApprovals,
  }
}

function createAgent(userId: string) {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) throw new Error('deepseek_api_key_missing')
  const deepseek = createOpenAICompatible({
    name: 'deepseek',
    baseURL: 'https://api.deepseek.com',
    apiKey,
  })
  const orderStatuses = ['Ожидает оплаты', 'Ожидает закупки', 'Заказан у поставщика', 'В пути', 'Прибыл', 'Завершён', 'Отменён', 'Проблема / возврат'] as const
  const expenseCategories = ['Упаковка', 'Доставка', 'Комиссии', 'Реклама', 'Подписки и сервисы', 'Прочее'] as const

  return new ToolLoopAgent({
    model: deepseek.chatModel(MODEL_ID),
    instructions: [
      'Ты — AI-помощник личного fashion-магазина CloStore. Отвечай по-русски, структурно и кратко.',
      'Для вопросов о товарах, заказах и финансах используй инструменты. Факты и расчёты сообщай только на основе их результатов; арифметику выполняет код.',
      'Товары, импортированные браузерным парсером Pinduoduo, уже являются черновиками карточек в каталоге. Для отчёта по переданным ID используй searchCatalog с productIds и source Pinduoduo; не утверждай, что агент сам видит страницы Pinduoduo.',
      'Для многошаговых задач последовательно используй доступные инструменты и кратко объясняй, что проверено.',
      'Создание черновика товара, редактирование карточки, изменение статуса заказа и запись расхода требуют явного подтверждения пользователя. Не утверждай, что действие выполнено, пока пользователь не подтвердил его и инструмент не вернул результат.',
      'Для карточек Pinduoduo обновляй только существующие неопубликованные черновики через updateProductCard, не создавай дубликаты. Не придумывай свойства, материал, размеры, цену в рублях или доставку; неизвестное оставляй незаполненным.',
      'После отказа не повторяй это действие. Если не хватает данных, задай уточняющий вопрос вместо того, чтобы выдумывать значения.',
      'Инструменты доступны только для личного пространства. Не запрашивай и не раскрывай имена или контакты покупателей.',
      'Публикации, закупки, интернет-поиск и любые действия с Telegram или Avito недоступны. Не изображай их выполнение.',
      'Для новой карточки товара используй только данные из запроса; неизвестные цены оставляй нулевыми и обязательно сообщай об этом.',
    ].join('\n'),
    stopWhen: isStepCount(MAX_AGENT_STEPS),
    maxRetries: 0,
    maxOutputTokens: 1200,
    experimental_toolApprovalSecret: process.env.BETTER_AUTH_SECRET,
    toolApproval: {
      createProductDraft: 'user-approval',
      updateProductCard: 'user-approval',
      updateOrderStatus: 'user-approval',
      recordExpense: 'user-approval',
    },
    tools: {
      searchCatalog: tool({
        description: 'Найти товары в личном каталоге CloStore по названию, точным ID, источнику Pinduoduo и необязательному статусу. Используй productIds для отчёта по только что импортированным товарам.',
        inputSchema: z.object({
          query: z.string().max(120).optional().describe('Часть названия или категории товара'),
          productIds: z.array(z.string().min(1).max(64)).min(1).max(12).optional().describe('Точные ID импортированных карточек'),
          status: z.enum(['active', 'review', 'draft', 'rejected']).optional().describe('Фильтр по внутреннему статусу товара'),
          source: z.enum(['Pinduoduo']).optional().describe('Фильтр по источнику товара'),
          limit: z.number().int().min(1).max(12).optional(),
        }),
        execute: async ({ query, productIds, status, source, limit }) => {
          const filters = [eq(products.userId, userId)]
          const normalizedQuery = query?.trim()
          const normalizedProductIds = productIds ? [...new Set(productIds)] : []
          if (normalizedQuery) filters.push(or(
            ilike(products.name, `%${normalizedQuery}%`),
            ilike(products.category, `%${normalizedQuery}%`),
          )!)
          if (normalizedProductIds.length) filters.push(inArray(products.id, normalizedProductIds))
          if (status) filters.push(eq(products.status, status))
          if (source) filters.push(eq(products.source, source))

          const rows = await db.select({
            id: products.id,
            name: products.name,
            category: products.category,
            source: products.source,
            sourceUrl: products.sourceUrl,
            purchasePriceCny: products.purchasePriceCny,
            purchasePriceRub: products.purchasePriceRub,
            salePriceRub: products.salePriceRub,
            sizes: products.sizes,
            images: products.images,
            description: products.description,
            status: products.status,
          }).from(products)
            .where(and(...filters))
            .orderBy(desc(products.createdAt))
            .limit(limit ?? 8)

          return rows.map((row) => {
            const purchasePriceCny = Number(row.purchasePriceCny)
            const purchasePriceRub = Number(row.purchasePriceRub)
            const salePriceRub = Number(row.salePriceRub)
            return {
              id: row.id,
              name: row.name,
              category: row.category,
              source: row.source,
              sourceUrl: row.sourceUrl,
              purchasePriceCny,
              purchasePriceRub,
              salePriceRub,
              grossMarginRub: purchasePriceRub > 0 && salePriceRub > 0
                ? Math.round((salePriceRub - purchasePriceRub) * 100) / 100
                : null,
              sizes: row.sizes,
              imageCount: row.images.length,
              description: row.description,
              status: row.status,
            }
          })
        },
      }),
      listSuppliers: tool({
        description: 'Найти сохранённых поставщиков CloStore и показать только реальные пол�� из Neon: площадку, ссылку, статус, заметки и количество связанных товаров. Рейтинг и отзывы не выдумывай — их нет в текущей базе.',
        inputSchema: z.object({ query: z.string().max(120).optional(), limit: z.number().int().min(1).max(20).optional() }),
        execute: async ({ query, limit }) => {
          const filters = [eq(suppliers.userId, userId)]
          const normalizedQuery = query?.trim()
          if (normalizedQuery) filters.push(or(ilike(suppliers.name, `%${normalizedQuery}%`), ilike(suppliers.platform, `%${normalizedQuery}%`))!)

          return db.select({
            name: suppliers.name,
            platform: suppliers.platform,
            storeUrl: suppliers.storeUrl,
            status: suppliers.status,
            notes: suppliers.notes,
            productCount: count(products.id),
          }).from(suppliers)
            .leftJoin(products, and(eq(products.supplierId, suppliers.id), eq(products.userId, userId)))
            .where(and(...filters))
            .groupBy(suppliers.id, suppliers.name, suppliers.platform, suppliers.storeUrl, suppliers.status, suppliers.notes)
            .orderBy(suppliers.name)
            .limit(limit ?? 10)
        },
      }),
      listOrders: tool({
        description: 'Показать личные заказы по статусу заказа, этапу доставки или названию товара. Для вопроса о посылках в пути используй этап доставки. Не возвращает имена и контакты покупателей.',
        inputSchema: z.object({
          productQuery: z.string().max(120).optional(),
          status: z.enum(orderStatuses).optional(),
          deliveryStatus: z.enum(['Не отправлен', 'В пути по Китаю', 'Международная доставка', 'Прибыл', 'Передан покупателю', 'Проблема']).optional(),
          limit: z.number().int().min(1).max(12).optional(),
        }),
        execute: async ({ productQuery, status, deliveryStatus, limit }) => {
          const filters = [eq(orders.userId, userId)]
          const normalizedQuery = productQuery?.trim()
          if (normalizedQuery) filters.push(ilike(orders.productName, `%${normalizedQuery}%`))
          if (status) filters.push(eq(orders.status, status))
          if (deliveryStatus) filters.push(eq(orders.deliveryStatus, deliveryStatus))

          const rows = await db.select({
            id: orders.id,
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
            .limit(limit ?? 8)

          return rows.map((row) => ({
            ...row,
            salePriceRub: Number(row.salePriceRub),
            costRub: Number(row.costRub),
            createdAt: row.createdAt.toISOString(),
          }))
        },
      }),
      getFinancialSummary: tool({
        description: 'Рассчитать фактические суммарные показатели по завершённым заказам и сохранённым дополнительным расходам. Все суммы рассчитываются программно.',
        inputSchema: z.object({}),
        execute: async () => {
          const [orderRows, expenseRows] = await Promise.all([
            db.select({ quantity: orders.quantity, salePriceRub: orders.salePriceRub, costRub: orders.costRub })
              .from(orders).where(and(eq(orders.userId, userId), eq(orders.paymentStatus, 'Оплачен'))),
            db.select({ amountRub: financialTransactions.amountRub })
              .from(financialTransactions).where(eq(financialTransactions.userId, userId)),
          ])
          const revenueRub = orderRows.reduce((sum, row) => sum + row.quantity * Number(row.salePriceRub), 0)
          const costRub = orderRows.reduce((sum, row) => sum + row.quantity * Number(row.costRub), 0)
          const expensesRub = expenseRows.reduce((sum, row) => sum + Number(row.amountRub), 0)
          return {
            completedOrders: orderRows.length,
            revenueRub: Math.round(revenueRub * 100) / 100,
            costRub: Math.round(costRub * 100) / 100,
            grossProfitRub: Math.round((revenueRub - costRub) * 100) / 100,
            additionalExpensesRub: Math.round(expensesRub * 100) / 100,
            netProfitRub: Math.round((revenueRub - costRub - expensesRub) * 100) / 100,
          }
        },
      }),
      createProductDraft: tool({
        description: 'Создать черновик новой карточки товара в очереди проверки после подтверждения пользователя. Не публикует товар.',
        inputSchema: z.object({
          name: z.string().min(1).max(180),
          category: z.string().max(120).optional(),
          source: z.string().max(120).optional(),
          sourceUrl: z.string().max(2048).url().optional(),
          purchasePriceCny: z.number().min(0).max(100_000_000).optional(),
          purchasePriceRub: z.number().min(0).max(100_000_000).optional(),
          salePriceRub: z.number().min(0).max(100_000_000).optional(),
          sizes: z.array(z.string().max(40)).max(20).optional(),
          description: z.string().max(8000).optional(),
        }),
        execute: async (input) => {
          const name = input.name.trim()
          if (!name) return { created: false, reason: 'Название товара не может быть пустым.' }
          const id = randomUUID()
          await db.insert(products).values({
            id,
            userId,
            name,
            category: input.category?.trim() ?? '',
            source: input.source?.trim() ?? '',
            sourceUrl: input.sourceUrl ?? null,
            purchasePriceCny: String(Math.round((input.purchasePriceCny ?? 0) * 100) / 100),
            purchasePriceRub: String(Math.round((input.purchasePriceRub ?? 0) * 100) / 100),
            salePriceRub: String(Math.round((input.salePriceRub ?? 0) * 100) / 100),
            sizes: input.sizes?.map((size) => size.trim()).filter(Boolean) ?? [],
            description: input.description?.trim() ?? '',
            status: 'review',
            listingStatus: 'unpublished',
          })
          return { created: true, id, name, status: 'добавлен в очередь проверки', published: false }
        },
      }),
      updateProductCard: tool({
        description: 'Обновить название, категорию или описание существующей неопубликованной карточки Pinduoduo после подтверждения пользователя. Не меняет цену, размеры, источник или статус.',
        inputSchema: z.object({
          productId: z.string().min(1).max(64),
          currentName: z.string().trim().min(1).max(180),
          name: z.string().trim().min(2).max(180).optional(),
          category: z.string().trim().max(120).optional(),
          description: z.string().trim().min(1).max(1200).optional(),
        }).refine((input) => input.name !== undefined || input.category !== undefined || input.description !== undefined, {
          message: 'Укажите хотя бы одно поле карточки для обновления.',
        }),
        execute: async (input) => {
          const updates: { name?: string; category?: string; description?: string; updatedAt: Date } = { updatedAt: new Date() }
          if (input.name !== undefined) updates.name = input.name.trim()
          if (input.category !== undefined) updates.category = input.category.trim()
          if (input.description !== undefined) updates.description = input.description.trim()

          const [updated] = await db.update(products).set(updates).where(and(
            eq(products.id, input.productId),
            eq(products.name, input.currentName),
            eq(products.userId, userId),
            eq(products.source, 'Pinduoduo'),
            eq(products.listingStatus, 'unpublished'),
            or(eq(products.status, 'review'), eq(products.status, 'draft'))!,
          )).returning({ id: products.id, name: products.name })

          if (!updated) return { updated: false, reason: 'Карточка не найдена или уже не является неопубликованным черновиком Pinduoduo.' }
          revalidatePath('/')
          return { updated: true, id: updated.id, name: updated.name, status: 'черновик обновлён', published: false }
        },
      }),
      updateOrderStatus: tool({
        description: 'Изменить статус одного личного заказа после подтверждения пользователя. Сначала найди заказ через listOrders и используй его id.',
        inputSchema: z.object({
          orderId: z.string().min(1).max(64),
          status: z.enum(orderStatuses),
        }),
        execute: async ({ orderId, status }) => db.transaction(async (transaction) => {
          const [existing] = await transaction.select({ id: orders.id, productName: orders.productName, status: orders.status })
            .from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId))).limit(1)
          if (!existing) return { updated: false, reason: 'Заказ не найден в личном пространстве.' }
          if (existing.status === status) return { updated: false, reason: 'У заказа уже установлен этот статус.', productName: existing.productName }

          await transaction.update(orders).set({ status, updatedAt: new Date() })
            .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
          await transaction.insert(orderStatusHistory).values({
            id: randomUUID(),
            userId,
            orderId,
            field: 'Статус заказа',
            previousValue: existing.status,
            newValue: status,
            note: 'Изменено AI-агентом после подтверждения пользователя',
          })
          return { updated: true, productName: existing.productName, previousStatus: existing.status, status }
        }),
      }),
      recordExpense: tool({
        description: 'Записать дополнительный расход в рублях после подтверждения пользователя. Не рассчитывай сумму вместо пользователя.',
        inputSchema: z.object({
          category: z.enum(expenseCategories),
          amountRub: z.number().positive().max(100_000_000),
          notes: z.string().max(1000).optional(),
        }),
        execute: async ({ category, amountRub, notes }) => {
          const id = randomUUID()
          const roundedAmount = Math.round(amountRub * 100) / 100
          await db.insert(financialTransactions).values({
            id,
            userId,
            category,
            amountRub: String(roundedAmount),
            notes: notes?.trim() ?? '',
            occurredAt: new Date(),
          })
          return { recorded: true, id, category, amountRub: roundedAmount }
        },
      }),
    },
  })
}

function toTaskPreview(row: {
  id: string
  prompt: string
  response: string
  status: string
  model: string
  inputTokens: number | null
  outputTokens: number | null
  createdAt: Date
}): AgentTaskPreview {
  const response = parseResponse(row.response)
  return {
    id: row.id,
    prompt: row.prompt,
    response: response.text,
    pendingApprovals: response.pendingApprovals,
    status: row.status as AgentTaskPreview['status'],
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function getAgentUsage() {
  const userId = await getPersonalWorkspaceUserId()
  const [totals] = await db.select({
    taskCount: count(),
    inputTokens: sql<string>`coalesce(sum(${agentTasks.inputTokens}), 0)::text`,
    outputTokens: sql<string>`coalesce(sum(${agentTasks.outputTokens}), 0)::text`,
  }).from(agentTasks).where(eq(agentTasks.userId, userId))

  return {
    taskCount: Number(totals?.taskCount ?? 0),
    inputTokens: Number(totals?.inputTokens ?? 0),
    outputTokens: Number(totals?.outputTokens ?? 0),
  }
}

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

  return rows.map(toTaskPreview)
}

export async function runAgentTask(rawPrompt: string) {
  if (typeof rawPrompt !== 'string') return { ok: false as const, reason: 'invalid_input' as const }
  const prompt = rawPrompt.trim()
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
    return { ok: false as const, reason: 'invalid_input' as const }
  }

  if (!process.env.DEEPSEEK_API_KEY?.trim()) return { ok: false as const, reason: 'api_key_missing' as const }

  const userId = await getPersonalWorkspaceUserId()
  const taskId = randomUUID()
  const initialResponse: StoredAgentResponse = {
    format: 'clostore-agent-v1',
    text: '',
    messages: [{ role: 'user', content: prompt }],
    pendingApprovals: [],
  }
  const canStartTask = await db.transaction(async (transaction) => {
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId})::bigint)`)
    const [recentTasks] = await transaction.select({ total: count() }).from(agentTasks)
      .where(and(eq(agentTasks.userId, userId), gte(agentTasks.createdAt, new Date(Date.now() - 60 * 60 * 1000))))
    if (recentTasks.total >= MAX_TASKS_PER_HOUR) return false

    await transaction.insert(agentTasks).values({
      id: taskId,
      userId,
      prompt,
      response: serializeResponse(initialResponse),
      status: 'running',
      model: MODEL_ID,
    })
    return true
  })
  if (!canStartTask) return { ok: false as const, reason: 'rate_limited' as const }

  try {
    const messages = initialResponse.messages
    const result = await createAgent(userId).generate({ messages, abortSignal: AbortSignal.timeout(45_000) })
    const response = responseForResult(result, messages)
    const status = response.pendingApprovals.length ? 'awaiting_approval' : 'completed'
    const inputTokens = result.usage.inputTokens ?? null
    const outputTokens = result.usage.outputTokens ?? null
    await db.update(agentTasks).set({
      response: serializeResponse(response),
      status,
      inputTokens,
      outputTokens,
      updatedAt: new Date(),
    }).where(and(eq(agentTasks.id, taskId), eq(agentTasks.userId, userId)))
    revalidatePath('/')

    return { ok: true as const, task: toTaskPreview({
      id: taskId,
      prompt,
      response: serializeResponse(response),
      status,
      model: MODEL_ID,
      inputTokens,
      outputTokens,
      createdAt: new Date(),
    }) }
  } catch {
    const reason = 'provider_unavailable'
    const failedResponse = { ...initialResponse, text: 'DeepSeek временно недоступен. Попробуйте повторить задачу позже.' }
    await db.update(agentTasks).set({ response: serializeResponse(failedResponse), status: 'failed', updatedAt: new Date() })
      .where(and(eq(agentTasks.id, taskId), eq(agentTasks.userId, userId)))
      .catch(() => undefined)
    return { ok: false as const, reason }
  }
}

export async function cancelAgentTask(taskId: string) {
  if (typeof taskId !== 'string' || taskId.length > 64) return { ok: false as const, reason: 'invalid_input' as const }

  const userId = await getPersonalWorkspaceUserId()
  const [existing] = await db.select({
    id: agentTasks.id,
    prompt: agentTasks.prompt,
    response: agentTasks.response,
    status: agentTasks.status,
    model: agentTasks.model,
    inputTokens: agentTasks.inputTokens,
    outputTokens: agentTasks.outputTokens,
    createdAt: agentTasks.createdAt,
  }).from(agentTasks)
    .where(and(eq(agentTasks.id, taskId), eq(agentTasks.userId, userId), eq(agentTasks.status, 'awaiting_approval')))
    .limit(1)

  if (!existing) return { ok: false as const, reason: 'stale_task' as const }

  const current = parseResponse(existing.response)
  const response: StoredAgentResponse = {
    ...current,
    text: 'Задача отменена пользователем. Подтверждённые действия не выполнялись.',
    pendingApprovals: [],
  }
  const [cancelled] = await db.update(agentTasks).set({
    response: serializeResponse(response),
    status: 'cancelled',
    updatedAt: new Date(),
  }).where(and(eq(agentTasks.id, taskId), eq(agentTasks.userId, userId), eq(agentTasks.status, 'awaiting_approval')))
    .returning({ id: agentTasks.id })

  if (!cancelled) return { ok: false as const, reason: 'stale_task' as const }
  revalidatePath('/')
  return { ok: true as const, task: toTaskPreview({ ...existing, response: serializeResponse(response), status: 'cancelled' }) }
}

export async function respondToAgentApprovals(
  taskId: string,
  rawDecisions: { approvalId: string; approved: boolean }[],
) {
  const decisionsResult = z.array(z.object({
    approvalId: z.string().min(1).max(200),
    approved: z.boolean(),
  })).min(1).max(12).safeParse(rawDecisions)
  if (typeof taskId !== 'string' || taskId.length > 64 || !decisionsResult.success) {
    return { ok: false as const, reason: 'invalid_input' as const }
  }

  if (!process.env.DEEPSEEK_API_KEY?.trim()) return { ok: false as const, reason: 'api_key_missing' as const }

  const userId = await getPersonalWorkspaceUserId()
  const [existing] = await db.select({
    id: agentTasks.id,
    prompt: agentTasks.prompt,
    response: agentTasks.response,
    status: agentTasks.status,
    model: agentTasks.model,
    inputTokens: agentTasks.inputTokens,
    outputTokens: agentTasks.outputTokens,
    createdAt: agentTasks.createdAt,
  }).from(agentTasks).where(and(eq(agentTasks.id, taskId), eq(agentTasks.userId, userId))).limit(1)
  if (!existing || existing.status !== 'awaiting_approval') return { ok: false as const, reason: 'stale_approval' as const }

  const existingState = parseResponse(existing.response)
  const decisions = decisionsResult.data
  const requestedIds = existingState.pendingApprovals.map((approval) => approval.approvalId).sort()
  const suppliedIds = decisions.map((decision) => decision.approvalId).sort()
  if (!requestedIds.length || requestedIds.length !== suppliedIds.length || requestedIds.some((id, index) => id !== suppliedIds[index])) {
    return { ok: false as const, reason: 'stale_approval' as const }
  }

  const [claimed] = await db.update(agentTasks).set({ status: 'running', updatedAt: new Date() })
    .where(and(eq(agentTasks.id, taskId), eq(agentTasks.userId, userId), eq(agentTasks.status, 'awaiting_approval')))
    .returning({ response: agentTasks.response, inputTokens: agentTasks.inputTokens, outputTokens: agentTasks.outputTokens })
  if (!claimed) return { ok: false as const, reason: 'stale_approval' as const }

  const state = parseResponse(claimed.response)
  const decisionById = new Map(decisions.map((decision) => [decision.approvalId, decision.approved]))
  const approvalResponses: ToolApprovalResponse[] = state.pendingApprovals.map((approval) => ({
    type: 'tool-approval-response',
    approvalId: approval.approvalId,
    approved: decisionById.get(approval.approvalId) === true,
    reason: decisionById.get(approval.approvalId) === true
      ? 'Пользователь подтвердил действие'
      : 'Пользователь отклонил действие',
  }))
  const messages: ModelMessage[] = [
    ...state.messages,
    { role: 'tool', content: approvalResponses },
  ]

  try {
    const result = await createAgent(userId).generate({ messages, abortSignal: AbortSignal.timeout(45_000) })
    const response = responseForResult(result, messages)
    const status = response.pendingApprovals.length ? 'awaiting_approval' : 'completed'
    const inputTokens = (claimed.inputTokens ?? 0) + (result.usage.inputTokens ?? 0)
    const outputTokens = (claimed.outputTokens ?? 0) + (result.usage.outputTokens ?? 0)
    await db.update(agentTasks).set({
      response: serializeResponse(response),
      status,
      inputTokens,
      outputTokens,
      updatedAt: new Date(),
    }).where(and(eq(agentTasks.id, taskId), eq(agentTasks.userId, userId)))
    revalidatePath('/')

    return { ok: true as const, task: toTaskPreview({
      ...existing,
      response: serializeResponse(response),
      status,
      inputTokens,
      outputTokens,
      createdAt: existing.createdAt,
    }) }
  } catch {
    const hasApprovedAction = decisions.some((decision) => decision.approved)
    const failureResponse: StoredAgentResponse = {
      format: 'clostore-agent-v1',
      text: hasApprovedAction
        ? 'Не удалось получить финальный ответ после подтверждения. Перед повтором проверьте каталог, заказ и финансовые записи, чтобы не создать дубликат.'
        : 'Не удалось завершить задачу. Действия были отклонены и не выполнялись.',
      messages: state.messages,
      pendingApprovals: [],
    }
    await db.update(agentTasks).set({
      response: serializeResponse(failureResponse),
      status: 'failed',
      updatedAt: new Date(),
    }).where(and(eq(agentTasks.id, taskId), eq(agentTasks.userId, userId)))
    revalidatePath('/')
    return { ok: true as const, task: toTaskPreview({
      ...existing,
      response: serializeResponse(failureResponse),
      status: 'failed',
      createdAt: existing.createdAt,
    }) }
  }
}
