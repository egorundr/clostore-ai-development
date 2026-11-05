const appOriginInput = document.querySelector('#app-origin')
const tokenInput = document.querySelector('#token')
const connectButton = document.querySelector('#connect')
const queryInput = document.querySelector('#search-query')
const openSearchButton = document.querySelector('#open-search')
const scanButton = document.querySelector('#scan-page')
const statusElement = document.querySelector('#status')
const checkAgentCommandButton = document.querySelector('#check-agent-command')
const agentCommandCard = document.querySelector('#agent-command-card')
const agentCommandQuery = document.querySelector('#agent-command-query')
const openAgentSearchButton = document.querySelector('#open-agent-search')
const sendAgentResultsButton = document.querySelector('#send-agent-results')
const autoSearchStatusElement = document.querySelector('#auto-search-status')
let activeBrowserCommand = null

function setStatus(message, tone = '') {
  statusElement.textContent = message
  statusElement.dataset.tone = tone
}

function normalizeAppOrigin(value) {
  const parsed = new URL(value.trim())
  const isLocalDevelopment = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)
  if ((!isLocalDevelopment && parsed.protocol !== 'https:') || parsed.username || parsed.password) {
    throw new Error('Укажите HTTPS-адрес Clostore без логина и пароля.')
  }
  return parsed.origin
}

function isPersistentSearchToken(token) {
  try {
    const payload = token.split('.')[0].replaceAll('-', '+').replaceAll('_', '/')
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')))
    return claims.version === 3 && claims.scopes?.length === 1 && claims.scopes[0] === 'browser:commands'
  } catch {
    return false
  }
}

function isPinduoduoUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === 'pinduoduo.com' || hostname.endsWith('.pinduoduo.com') || hostname === 'yangkeduo.com' || hostname.endsWith('.yangkeduo.com')
  } catch {
    return false
  }
}

function showAgentCommand(command) {
  activeBrowserCommand = command
  agentCommandCard.hidden = !command
  agentCommandQuery.textContent = command?.query || ''
}

async function loadConnection() {
  const [session, local] = await Promise.all([
    chrome.storage.session.get(['appOrigin', 'token', 'browserCommand']),
    chrome.storage.local.get(['agentConnection', 'clostoreAgentSearchStatus']),
  ])
  const connection = local.agentConnection || session
  appOriginInput.value = connection.appOrigin || ''
  tokenInput.value = connection.token || ''
  if (local.agentConnection) {
    checkAgentCommandButton.hidden = true
    autoSearchStatusElement.hidden = false
    autoSearchStatusElement.textContent = local.clostoreAgentSearchStatus?.message || 'Автопоиск подключён. Команды AI-агента будут обрабатываться автоматически.'
    autoSearchStatusElement.dataset.tone = local.clostoreAgentSearchStatus?.tone || 'success'
  } else if (session.browserCommand?.taskId && session.browserCommand?.commandId && session.browserCommand?.query) {
    showAgentCommand(session.browserCommand)
  }
}

async function getConnection() {
  const { agentConnection } = await chrome.storage.local.get('agentConnection')
  if (agentConnection?.appOrigin && agentConnection?.token) return agentConnection
  return chrome.storage.session.get(['appOrigin', 'token'])
}

async function postAgentCommand(payload) {
  const { appOrigin, token } = await getConnection()
  if (!appOrigin || !token) throw new Error('Сначала сохраните адрес Clostore и временный токен.')

  const response = await fetch(`${appOrigin}/api/pinduoduo/agent-command`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result?.ok) throw new Error(result?.reason === 'stale_command'
    ? 'Эта команда уже обработана. Обновите задачу в Clostore.'
    : result?.reason === 'not_authorized'
      ? 'Токен истёк или не имеет доступа к командам. Создайте новый в Clostore.'
      : 'Clostore не принял команду. Проверьте подключение и обновите токен.')
  return result
}

connectButton.addEventListener('click', async () => {
  try {
    const appOrigin = normalizeAppOrigin(appOriginInput.value)
    const token = tokenInput.value.trim()
    if (!token || token.length > 4096) {
      setStatus('Вставьте действующий временный токен из Clostore.', 'error')
      return
    }

    const persistentSearch = isPersistentSearchToken(token)
    const origins = [`${appOrigin}/*`]
    if (persistentSearch) origins.push('https://mobile.yangkeduo.com/*', 'https://*.pinduoduo.com/*', 'https://*.yangkeduo.com/*')
    const permission = await chrome.permissions.request({ origins })
    if (!permission) {
      setStatus('Не выданы все разрешения, необходимые для подключения расширения.', 'error')
      return
    }

    await chrome.storage.session.set({ appOrigin, token })
    if (persistentSearch) {
      await chrome.storage.local.set({
        agentConnection: { appOrigin, token },
        clostoreAgentSearchStatus: { message: 'Автопоиск подключён. Расширение будет проверять очередь раз в минуту.', tone: 'success', updatedAt: Date.now() },
      })
      chrome.alarms.create('clostore-pinduoduo-agent-poll', { periodInMinutes: 1 })
      chrome.runtime.sendMessage({ type: 'RUN_AGENT_SEARCH_POLL' }).catch(() => undefined)
      checkAgentCommandButton.hidden = true
      autoSearchStatusElement.hidden = false
      autoSearchStatusElement.textContent = 'Автопоиск подключён. Расширение будет проверять очередь раз в минуту.'
      autoSearchStatusElement.dataset.tone = 'success'
      setStatus('Постоянное подключение сохранено в браузере. Поиск запускается только когда вы просите об этом в Clostore.', 'success')
    } else {
      await chrome.storage.local.remove('agentConnection')
      chrome.alarms.clear('clostore-pinduoduo-agent-poll')
      checkAgentCommandButton.hidden = false
      autoSearchStatusElement.hidden = true
      setStatus('Подключение для ручного импорта сохранено в памяти текущего сеанса браузера.', 'success')
    }
  } catch {
    setStatus('Проверьте HTTPS-адрес приложения и временный токен.', 'error')
  }
})

openSearchButton.addEventListener('click', async () => {
  const query = queryInput.value.trim()
  if (query.length < 2) {
    setStatus('Введите не менее двух символов для поиска.', 'error')
    return
  }

  const searchUrl = new URL('https://mobile.yangkeduo.com/search_result.html')
  searchUrl.searchParams.set('search_key', query)
  await chrome.tabs.create({ url: searchUrl.toString(), active: true })
})

scanButton.addEventListener('click', async () => {
  scanButton.disabled = true
  const originalText = scanButton.textContent
  scanButton.textContent = 'Сканирование…'

  try {
    const { appOrigin, token } = await chrome.storage.session.get(['appOrigin', 'token'])
    if (!appOrigin || !token) {
      setStatus('Сначала сохраните адрес Clostore и временный токен.', 'error')
      return
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id || !tab.url || !isPinduoduoUrl(tab.url)) {
      setStatus('Откройте страницу поиска или товара Pinduoduo в активной вкладке.', 'error')
      return
    }

    const permission = await chrome.permissions.contains({ origins: [`${appOrigin}/*`] })
    if (!permission) {
      setStatus('Разрешение Clostore отсутствует. Сохраните подключение ещё раз.', 'error')
      return
    }

    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractVisibleProducts,
    })
    const scan = injection?.result

    if (!scan || scan.status === 'unavailable') {
      setStatus('Не удалось прочитать открытую страницу Pinduoduo.', 'error')
      return
    }
    if (scan.status === 'challenge') {
      setStatus('Обнаружена проверка или CAPTCHA. Сканирование остановлено; автоматического продолжения нет.', 'error')
      return
    }
    if (!scan.products?.length) {
      setStatus('На странице не найдены видимые карточки товаров. Попробуйте страницу результатов или карточку товара.', 'error')
      return
    }

    const response = await fetch(`${appOrigin}/api/pinduoduo/extension-import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ products: scan.products }),
    })

    if (response.status === 401) {
      setStatus('Временный токен истёк. Создайте новый в разделе Pinduoduo в Clostore.', 'error')
      return
    }

    const result = await response.json().catch(() => null)
    if (!response.ok || !result?.ok) {
      setStatus('Clostore не принял результаты. Проверьте адрес приложения и создайте новый токен.', 'error')
      return
    }

    const importSummary = `Разобрано ${scan.products.length}; добавлено ${result.imported}, дубликаты ${result.duplicates}, пропущено ${result.rejected}.`
    const agentReport = result.agentReport?.ok
      ? `\n\nОтчёт агента:\n${result.agentReport.text}${result.agentReport.pendingApprovalCount ? `\n\nПодготовлено изменений карточек: ${result.agentReport.pendingApprovalCount}. Подтвердите их в разделе AI-агент.` : '\n\nПолный отчёт сохранён в истории AI-агента.'}`
      : '\n\nТовары сохранены, но отчёт агента не подготовлен. Повторите запрос позж�� или попросите отчёт в разделе AI-агент.'
    setStatus(`${importSummary}${agentReport}`, 'success')
  } catch {
    setStatus('Не удалось получить итоговый ответ Clostore. Товары могли сохраниться; проверьте очередь каталога и историю AI-агента перед повторным запуском.', 'error')
  } finally {
    scanButton.disabled = false
    scanButton.textContent = originalText
  }
})

checkAgentCommandButton.addEventListener('click', async () => {
  checkAgentCommandButton.disabled = true
  try {
    const result = await postAgentCommand({ action: 'claim' })
    if (!result.command) {
      await chrome.storage.session.remove('browserCommand')
      showAgentCommand(null)
      setStatus('Нет подтверждённых команд AI-агента. Сначала отправьте запрос в Clostore и подтвердите поиск.', 'success')
      return
    }

    activeBrowserCommand = result.command
    await chrome.storage.session.set({ browserCommand: activeBrowserCommand })
    showAgentCommand(activeBrowserCommand)
    setStatus('Команда получена. Откройте поиск вручную, затем вернитесь на страницу результатов и отправьте видимые товары.', 'success')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Не удалось проверить команды Clostore.', 'error')
  } finally {
    checkAgentCommandButton.disabled = false
  }
})

openAgentSearchButton.addEventListener('click', async () => {
  if (!activeBrowserCommand?.query) return
  const searchUrl = new URL('https://mobile.yangkeduo.com/search_result.html')
  searchUrl.searchParams.set('search_key', activeBrowserCommand.query)
  await chrome.tabs.create({ url: searchUrl.toString(), active: true })
  setStatus('Поиск открыт в новой вкладке. Когда результаты загрузятся, нажмите «Передать видимые товары агенту».', 'success')
})

sendAgentResultsButton.addEventListener('click', async () => {
  if (!activeBrowserCommand?.taskId || !activeBrowserCommand?.commandId) return
  sendAgentResultsButton.disabled = true
  const originalText = sendAgentResultsButton.textContent
  sendAgentResultsButton.textContent = 'Передача агенту…'

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id || !tab.url || !isPinduoduoUrl(tab.url)) {
      setStatus('Откройте страницу результатов Pinduoduo в активной вкладке.', 'error')
      return
    }

    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractVisibleProducts,
    })
    const scan = injection?.result
    if (!scan || scan.status === 'unavailable') {
      setStatus('Не удалось прочитать открытую страницу Pinduoduo.', 'error')
      return
    }
    if (scan.status === 'challenge') {
      const result = await postAgentCommand({
        action: 'complete',
        taskId: activeBrowserCommand.taskId,
        commandId: activeBrowserCommand.commandId,
        status: 'challenge',
        products: [],
      })
      await chrome.storage.session.remove('browserCommand')
      showAgentCommand(null)
      setStatus(`Поиск остановлен на CAPTCHA или странице проверки.\n\n${result.task?.response || 'Задача обновлена в Clostore.'}`, 'error')
      return
    }

    const result = await postAgentCommand({
      action: 'complete',
      taskId: activeBrowserCommand.taskId,
      commandId: activeBrowserCommand.commandId,
      status: scan.status === 'challenge' ? 'challenge' : scan.products?.length ? 'ok' : 'empty',
      products: scan.products || [],
    })
    await chrome.storage.session.remove('browserCommand')
    showAgentCommand(null)
    const task = result.task
    setStatus(task
      ? `Результат передан агенту.\n\n${task.response}${task.pendingApprovals?.length ? `\n\nПодготовлено действий: ${task.pendingApprovals.length}. Подтвердите их в разделе AI-агент.` : ''}`
      : 'Результат передан агенту. Обновите задачу в Clostore.', 'success')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Не удалось передать результаты агенту.', 'error')
  } finally {
    sendAgentResultsButton.disabled = false
    sendAgentResultsButton.textContent = originalText
  }
})

const extractVisibleProducts = globalThis.clostoreExtractVisibleProducts

loadConnection().catch(() => setStatus('Не удалось загрузить настройки расширения.', 'error'))
