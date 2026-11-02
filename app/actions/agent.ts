'use server'

import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { generateText, gateway } from 'ai'
import { db } from '@/lib/db'
import { agentTasks } from '@/lib/db/schema'
import { getPersonalWorkspaceUserId } from '@/lib/personal-workspace'
import type { AgentTaskPreview } from '@/components/clostore/types'

const MODEL_ID = 'deepseek/deepseek-v4.1-flash'
const MAX_PROMPT_LENGTH = 4000
const HISTORY_LIMIT = 20

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
  await db.insert(agentTasks).values({
    id: taskId,
    userId,
    prompt,
    response: '',
    status: 'running',
    model: MODEL_ID,
  })

  try {
    const result = await generateText({
      model: gateway(MODEL_ID),
      system: [
        'Ты — AI-помощник личного fashion-магазина CloStore. Отвечай по-русски, структурно и кратко.',
        'У тебя нет доступа к поиску в интернете, каталогам, Telegram, Avito, заказам или инструментам приложения. Не утверждай, что выполнил внешние действия или проверил актуальные данные.',
        'Не выдумывай цены, наличие, курсы валют, характеристики товара и сведения о поставщиках. Для расчётов запрашивай недостающие исходные данные и показывай формулу.',
        'Не создавай заказы, не публикуй объявления и не изменяй данные. Давай только текстовые рекомендации и черновики; важные действия всегда требуют отдельного подтверждения пользователя.',
      ].join('\n'),
      prompt,
      maxOutputTokens: 1200,
      abortSignal: AbortSignal.timeout(45_000),
    })

    const inputTokens = result.usage.inputTokens ?? null
    const outputTokens = result.usage.outputTokens ?? null
    await db.update(agentTasks).set({
      response: result.text,
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
        response: result.text,
        status: 'completed' as const,
        model: MODEL_ID,
        inputTokens,
        outputTokens,
        createdAt: new Date().toISOString(),
      },
    }
  } catch {
    await db.update(agentTasks).set({ status: 'failed', updatedAt: new Date() })
      .where(and(eq(agentTasks.id, taskId), eq(agentTasks.userId, userId)))
      .catch(() => undefined)
    return { ok: false as const, reason: 'provider_unavailable' as const }
  }
}
