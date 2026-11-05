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

globalThis.clostoreExtractVisibleProducts = extractVisibleProducts
