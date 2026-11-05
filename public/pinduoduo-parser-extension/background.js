importScripts('product-parser.js')

const POLL_ALARM = 'clostore-pinduoduo-agent-poll'
const ACTIVE_SEARCH_KEY = 'clostoreActiveAgentSearch'
const SEARCH_STATUS_KEY = 'clostoreAgentSearchStatus'
let pollingQueue = false
const captureInProgress = new Set()

async function setSearchStatus(message, tone = 'success') {
  await chrome.storage.local.set({ [SEARCH_STATUS_KEY]: { message, tone, updatedAt: Date.now() } })
}

async function getAgentConnection() {
  const { agentConnection } = await chrome.storage.local.get('agentConnection')
  if (!agentConnection?.appOrigin || !agentConnection?.token) return null
  return agentConnection
}

async function sendAgentCommand(connection, payload) {
  const response = await fetch(`${connection.appOrigin}/api/pinduoduo/agent-command`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connection.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const result = await response.json().catch(() => null)
  return { response, result }
}

function buildSearchUrl(query) {
  const url = new URL('https://mobile.yangkeduo.com/search_result.html')
  url.searchParams.set('search_key', query)
  return url.toString()
}

async function processAgentCommand() {
  const connection = await getAgentConnection()
  if (!connection) return

  const { [ACTIVE_SEARCH_KEY]: activeSearch } = await chrome.storage.local.get(ACTIVE_SEARCH_KEY)
  if (activeSearch) {
    if (activeSearch.tabId != null) {
      try {
        const tab = await chrome.tabs.get(activeSearch.tabId)
        if (tab.status === 'complete' && !activeSearch.processing) await captureAgentSearch(activeSearch.tabId)
        return
      } catch {
        await chrome.storage.local.remove(ACTIVE_SEARCH_KEY)
      }
    } else {
      await chrome.storage.local.remove(ACTIVE_SEARCH_KEY)
    }
  }

  try {
    const { response, result } = await sendAgentCommand(connection, { action: 'claim' })
    if (response.status === 403) {
      await chrome.alarms.clear(POLL_ALARM)
      await setSearchStatus('Поиск отключён или токен устарел. Включите разрешение в Clostore и подключите расширение повторно.', 'error')
      return
    }
    if (!response.ok || !result?.ok) {
      await setSearchStatus('Не удалось проверить очередь AI-агента. Расширение повторит попытку автоматически.', 'error')
      return
    }
    if (!result.command) return

    await chrome.storage.local.set({
      [ACTIVE_SEARCH_KEY]: {
        ...result.command,
        appOrigin: connection.appOrigin,
        token: connection.token,
        processing: false,
      },
    })
    const tab = await chrome.tabs.create({ url: buildSearchUrl(result.command.query), active: false })
    const active = {
      ...result.command,
      appOrigin: connection.appOrigin,
      token: connection.token,
      tabId: tab.id,
      processing: false,
    }
    await chrome.storage.local.set({ [ACTIVE_SEARCH_KEY]: active })
    await setSearchStatus(`Ищу на Pinduoduo в фоновой вкладке: «${result.command.query}».`)
    if (tab.id != null && tab.status === 'complete') await captureAgentSearch(tab.id)
  } catch {
    await setSearchStatus('Не удалось подключиться к Clostore. Расширение повторит попытку автоматически.', 'error')
  }
}

async function processAgentSearch(tabId) {
  const { [ACTIVE_SEARCH_KEY]: activeSearch } = await chrome.storage.local.get(ACTIVE_SEARCH_KEY)
  if (!activeSearch || activeSearch.tabId !== tabId || activeSearch.processing) return

  await chrome.storage.local.set({ [ACTIVE_SEARCH_KEY]: { ...activeSearch, processing: true } })

  let scan = { status: 'empty', products: [] }
  try {
    const tab = await chrome.tabs.get(tabId)
    const hostname = new URL(tab.url || '').hostname.toLowerCase()
    const isPinduoduo = hostname === 'pinduoduo.com' || hostname.endsWith('.pinduoduo.com') || hostname === 'yangkeduo.com' || hostname.endsWith('.yangkeduo.com')
    if (!isPinduoduo) throw new Error('unexpected_domain')

    await chrome.scripting.executeScript({ target: { tabId }, files: ['product-parser.js'] })
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        const parser = globalThis.clostoreExtractVisibleProducts
        if (typeof parser !== 'function') return { status: 'unavailable', products: [] }
        let latest = { status: 'empty', products: [] }
        for (let attempt = 0; attempt < 10; attempt += 1) {
          latest = parser()
          if (latest.status === 'challenge' || latest.status === 'unavailable' || latest.products.length > 0) return latest
          await new Promise((resolve) => setTimeout(resolve, 1500))
        }
        return latest
      },
    })
    scan = injection?.result ?? scan
  } catch {
    scan = { status: 'empty', products: [] }
  }

  const status = scan.status === 'challenge' ? 'challenge' : scan.products?.length ? 'ok' : 'empty'
  try {
    const { response, result } = await sendAgentCommand(activeSearch, {
      action: 'complete',
      taskId: activeSearch.taskId,
      commandId: activeSearch.commandId,
      status,
      products: status === 'ok' ? scan.products : [],
    })
    if (response.status === 403) {
      await chrome.alarms.clear(POLL_ALARM)
      await setSearchStatus('Разрешение отключено или токен обновлён. Подключите расширение заново из Clostore.', 'error')
      await chrome.storage.local.remove(ACTIVE_SEARCH_KEY)
      await chrome.tabs.remove(tabId).catch(() => undefined)
      return
    }
    if (!response.ok || !result?.ok) throw new Error('completion_failed')

    const message = status === 'challenge'
      ? 'Поиск остановлен: Pinduoduo показал CAPTCHA или страницу проверки. Расширение не пытается обходить проверку.'
      : status === 'empty'
        ? 'На открытой странице не обнаружены видимые карточки товаров.'
        : `Результаты переданы AI-агенту.\n\n${result.task?.response || 'Ответ сохранён в истории AI-агента.'}`
    await setSearchStatus(message)
    await chrome.storage.local.remove(ACTIVE_SEARCH_KEY)
    await chrome.tabs.remove(tabId).catch(() => undefined)
  } catch {
    await chrome.storage.local.set({ [ACTIVE_SEARCH_KEY]: { ...activeSearch, processing: false } })
    await setSearchStatus('Не удалось передать результаты. Расширение повторит отправку при следующей проверке очереди.', 'error')
    await chrome.tabs.remove(tabId).catch(() => undefined)
  }
}

async function pollAgentCommand() {
  if (pollingQueue) return
  pollingQueue = true
  try {
    await processAgentCommand()
  } finally {
    pollingQueue = false
  }
}

async function captureAgentSearch(tabId) {
  if (captureInProgress.has(tabId)) return
  captureInProgress.add(tabId)
  try {
    await processAgentSearch(tabId)
  } finally {
    captureInProgress.delete(tabId)
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 })
})

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 })
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) void pollAgentCommand()
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') void captureAgentSearch(tabId)
})

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { [ACTIVE_SEARCH_KEY]: activeSearch } = await chrome.storage.local.get(ACTIVE_SEARCH_KEY)
  if (activeSearch?.tabId === tabId) {
    await chrome.storage.local.remove(ACTIVE_SEARCH_KEY)
    await setSearchStatus('Фоновая вкладка закрыта. Расширение повторит команду из очереди.', 'error')
  }
})

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'RUN_AGENT_SEARCH_POLL') void pollAgentCommand()
})

chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 })
