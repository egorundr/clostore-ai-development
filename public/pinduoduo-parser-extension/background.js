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

function buildSearchUrl(query, mode = 'text') {
  const url = new URL('https://mobile.yangkeduo.com/search_result.html')
  if (mode !== 'photo') url.searchParams.set('search_key', query)
  return url.toString()
}

async function uploadPinduoduoPhoto(imageDataUrl) {
  const pageText = (document.body?.innerText || '').slice(0, 12000)
  if (/验证码|安全验证|人机验证|滑动验证|请完成验证|访问过于频繁|操作频繁|captcha|verify you are human|security verification/i.test(pageText)) {
    return { ok: false, challenge: true }
  }
  if (typeof imageDataUrl !== 'string') return { ok: false }

  const findImageInput = () => Array.from(document.querySelectorAll('input[type="file"]'))
    .find((input) => !input.accept || /image|jpe?g|png/i.test(input.accept))
  let input = findImageInput()

  if (!input) {
    const photoControlPattern = /相机|照片|相册|图片搜索|以图搜|找同款|拍照|搜图|image.?search|search.?image|upload.?image|camera/i
    const control = Array.from(document.querySelectorAll('button,[role="button"],[aria-label],[title]'))
      .find((element) => photoControlPattern.test([
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.innerText,
      ].filter(Boolean).join(' ')))
    control?.click()

    for (let attempt = 0; attempt < 20 && !input; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250))
      input = findImageInput()
    }
  }
  if (!input) return { ok: false }

  const match = /^data:(image\/jpeg|image\/png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageDataUrl)
  if (!match) return { ok: false }
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0))
  const file = new File([bytes], match[1] === 'image/png' ? 'clostore-search.png' : 'clostore-search.jpg', { type: match[1] })
  const transfer = new DataTransfer()
  transfer.items.add(file)
  input.files = transfer.files
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  return { ok: true }
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
    const tab = await chrome.tabs.create({ url: buildSearchUrl(result.command.query, result.command.mode), active: false })
    const active = {
      ...result.command,
      appOrigin: connection.appOrigin,
      token: connection.token,
      tabId: tab.id,
      processing: false,
    }
    await chrome.storage.local.set({ [ACTIVE_SEARCH_KEY]: active })
    await setSearchStatus(result.command.mode === 'photo'
      ? 'Запускаю поиск по фото на Pinduoduo в фоновой вкладке.'
      : `Ищу на Pinduoduo в фоновой вкладке: «${result.command.query}».`)
    if (tab.id != null && tab.status === 'complete') await captureAgentSearch(tab.id)
  } catch {
    await setSearchStatus('Не удалось подключиться к Clostore. Расширение повторит попытку автоматически.', 'error')
  }
}

async function processAgentSearch(tabId) {
  let { [ACTIVE_SEARCH_KEY]: activeSearch } = await chrome.storage.local.get(ACTIVE_SEARCH_KEY)
  if (!activeSearch || activeSearch.tabId !== tabId || activeSearch.processing) return

  activeSearch = { ...activeSearch, processing: true }
  await chrome.storage.local.set({ [ACTIVE_SEARCH_KEY]: activeSearch })

  let scan = { status: 'empty', products: [] }
  try {
    const tab = await chrome.tabs.get(tabId)
    const hostname = new URL(tab.url || '').hostname.toLowerCase()
    const isPinduoduo = hostname === 'pinduoduo.com' || hostname.endsWith('.pinduoduo.com') || hostname === 'yangkeduo.com' || hostname.endsWith('.yangkeduo.com')
    if (!isPinduoduo) throw new Error('unexpected_domain')

    const { response: permissionResponse, result: permissionState } = await sendAgentCommand(activeSearch, { action: 'claim' })
    if (permissionResponse.status !== 403 && (!permissionResponse.ok || !permissionState?.ok)) {
      throw new Error('permission_check_failed')
    }
    if (permissionResponse.status === 403 || permissionState.command?.commandId !== activeSearch.commandId) {
      if (permissionResponse.status === 403) await chrome.alarms.clear(POLL_ALARM)
      await chrome.storage.local.remove(ACTIVE_SEARCH_KEY)
      await setSearchStatus(permissionResponse.status === 403
        ? 'Поиск остановлен: постоянное разрешение отключено.'
        : 'Команда отменена в CloStore.', 'error')
      await chrome.tabs.remove(tabId).catch(() => undefined)
      return
    }

    await chrome.scripting.executeScript({ target: { tabId }, files: ['product-parser.js'] })
    if (activeSearch.mode === 'photo' && !activeSearch.photoUploaded) {
      if (!activeSearch.photoDataUrl) {
        scan = { status: 'photo_upload_failed', products: [] }
      } else {
        const [upload] = await chrome.scripting.executeScript({
          target: { tabId },
          func: uploadPinduoduoPhoto,
          args: [activeSearch.photoDataUrl],
        })
        if (upload?.result?.challenge) {
          scan = { status: 'challenge', products: [] }
        } else if (!upload?.result?.ok) {
          scan = { status: 'photo_upload_failed', products: [] }
        } else {
          activeSearch = { ...activeSearch, photoUploaded: true }
          await chrome.storage.local.set({ [ACTIVE_SEARCH_KEY]: activeSearch })
        }
      }
    }

    if (scan.status !== 'challenge' && scan.status !== 'photo_upload_failed') {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId },
        func: async (maxAttempts) => {
          const parser = globalThis.clostoreExtractVisibleProducts
          if (typeof parser !== 'function') return { status: 'unavailable', products: [] }
          let latest = { status: 'empty', products: [] }
          for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            latest = parser()
            if (latest.status === 'challenge' || latest.status === 'unavailable' || latest.products.length > 0) return latest
            await new Promise((resolve) => setTimeout(resolve, 1500))
          }
          return latest
        },
        args: [activeSearch.mode === 'photo' ? 20 : 10],
      })
      scan = injection?.result ?? scan
    }
  } catch {
    scan = activeSearch.mode === 'photo' && !activeSearch.photoUploaded
      ? { status: 'photo_upload_failed', products: [] }
      : { status: 'empty', products: [] }
  }

  const status = scan.status === 'challenge'
    ? 'challenge'
    : scan.status === 'photo_upload_failed'
      ? 'photo_upload_failed'
      : scan.products?.length
        ? 'ok'
        : 'empty'
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
      : status === 'photo_upload_failed'
        ? 'Не удалось загрузить фото через интерфейс Pinduoduo. Проверьте, что поиск по фото доступен в этой сессии.'
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
