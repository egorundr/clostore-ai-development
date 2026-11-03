const appOriginInput = document.querySelector('#app-origin')
const tokenInput = document.querySelector('#token')
const connectButton = document.querySelector('#connect')
const queryInput = document.querySelector('#search-query')
const openSearchButton = document.querySelector('#open-search')
const scanButton = document.querySelector('#scan-page')
const statusElement = document.querySelector('#status')

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

function isPinduoduoUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === 'pinduoduo.com' || hostname.endsWith('.pinduoduo.com') || hostname === 'yangkeduo.com' || hostname.endsWith('.yangkeduo.com')
  } catch {
    return false
  }
}

async function loadConnection() {
  const { appOrigin = '', token = '' } = await chrome.storage.session.get(['appOrigin', 'token'])
  appOriginInput.value = appOrigin
  tokenInput.value = token
}

connectButton.addEventListener('click', async () => {
  try {
    const appOrigin = normalizeAppOrigin(appOriginInput.value)
    const token = tokenInput.value.trim()
    if (!token || token.length > 4096) {
      setStatus('Вставьте действующий временный токен из Clostore.', 'error')
      return
    }

    const permission = await chrome.permissions.request({ origins: [`${appOrigin}/*`] })
    if (!permission) {
      setStatus('Разрешение для адреса Clostore не выдано.', 'error')
      return
    }

    await chrome.storage.session.set({ appOrigin, token })
    setStatus('Подключение сохранено в памяти текущего сеанса браузера.', 'success')
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
      : '\n\nТовары сохранены, но отчёт агента не подготовлен. Повторите запрос позже или попросите отчёт в разделе AI-агент.'
    setStatus(`${importSummary}${agentReport}`, 'success')
  } catch {
    setStatus('Не удалось получить итоговый ответ Clostore. Товары могли сохраниться; проверьте очередь каталога и историю AI-агента перед повторным запуском.', 'error')
  } finally {
    scanButton.disabled = false
    scanButton.textContent = originalText
  }
})

function extractVisibleProducts() {
  const hostname = window.location.hostname.toLowerCase()
  const isPinduoduo = hostname === 'pinduoduo.com' || hostname.endsWith('.pinduoduo.com') || hostname === 'yangkeduo.com' || hostname.endsWith('.yangkeduo.com')
  if (!isPinduoduo) return { status: 'unavailable', products: [] }

  const pageText = (document.body?.innerText || '').slice(0, 12000)
  const challengePattern = /验证码|安全验证|人机验证|滑动验证|请完成验证|访问过于频繁|操作频繁|captcha|verify you are human|security verification/i
  if (challengePattern.test(pageText)) return { status: 'challenge', products: [] }

  const isVisible = (element) => {
    if (!element) return false
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0
  }
  const isProductUrl = (value) => {
    try {
      const url = new URL(value, window.location.href)
      const validHost = url.hostname === 'pinduoduo.com' || url.hostname.endsWith('.pinduoduo.com') || url.hostname === 'yangkeduo.com' || url.hostname.endsWith('.yangkeduo.com')
      return validHost && (url.searchParams.has('goods_id') || url.searchParams.has('goodsId') || /goods|item|detail/i.test(url.pathname))
    } catch {
      return false
    }
  }
  const cleanText = (value) => value.replace(/\s+/g, ' ').trim()
  const parsePrice = (value) => {
    const match = value.match(/(?:¥|￥)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:元|CNY)/i)
    return Number((match?.[1] || match?.[2] || '0').replaceAll(',', ''))
  }
  const collectImages = (root) => Array.from(root.querySelectorAll('img'))
    .filter((image) => {
      const rect = image.getBoundingClientRect()
      return isVisible(image) && rect.width >= 48 && rect.height >= 48
    })
    .map((image) => image.currentSrc || image.src || '')
    .filter((value) => value.startsWith('https://'))
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 4)

  const products = []
  const seen = new Set()
  const anchors = Array.from(document.querySelectorAll('a[href]')).slice(0, 3000)

  for (const anchor of anchors) {
    if (!isVisible(anchor) || !isProductUrl(anchor.href)) continue
    const productUrl = new URL(anchor.href, window.location.href).toString()
    if (seen.has(productUrl)) continue

    let card = anchor
    let current = anchor
    for (let depth = 0; depth < 6 && current; depth += 1) {
      const text = cleanText(current.innerText || '')
      const hasImage = current.querySelector('img') !== null
      const hasPrice = /(?:¥|￥)\s*\d|\d\s*(?:元|CNY)/i.test(text)
      if (hasImage && hasPrice && text.length >= 8 && text.length <= 1200) {
        card = current
        break
      }
      current = current.parentElement
    }

    const cardText = (card.innerText || anchor.innerText || '').trim()
    const lines = cardText.split(/\n+/).map(cleanText).filter(Boolean)
    const imageUrls = collectImages(card)
    const name = cleanText(
      anchor.getAttribute('aria-label') ||
      anchor.querySelector('img[alt]')?.getAttribute('alt') ||
      lines.find((line) => line.length >= 3 && line.length <= 180 && !/(?:¥|￥)\s*\d|\d\s*(?:元|CNY)|已拼|已售|人付款/i.test(line)) ||
      '',
    )
    if (name.length < 2) continue

    seen.add(productUrl)
    products.push({
      name: name.slice(0, 180),
      productUrl,
      priceCny: parsePrice(cardText),
      sellerName: '',
      salesHint: '',
      imageUrls,
    })
    if (products.length >= 12) break
  }

  if (!products.length && isProductUrl(window.location.href)) {
    const title = cleanText(document.querySelector('h1')?.innerText || '')
    const imageUrls = collectImages(document.body)
    const priceCny = parsePrice(pageText)
    if (title.length >= 2) {
      products.push({
        name: title.slice(0, 180),
        productUrl: window.location.href,
        priceCny,
        sellerName: '',
        salesHint: '',
        imageUrls,
      })
    }
  }

  return { status: 'ok', products }
}

loadConnection().catch(() => setStatus('Не удалось загрузить настройки расширения.', 'error'))
