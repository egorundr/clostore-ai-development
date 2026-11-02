import 'server-only'

function getAvitoCredentials() {
  const clientId = process.env.AVITO_CLIENT_ID?.trim()
  const clientSecret = process.env.AVITO_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) throw new Error('Avito configuration is incomplete')
  return { clientId, clientSecret }
}

async function getAvitoAccessToken() {
  const credentials = getAvitoCredentials()
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
  })
  const response = await fetch('https://api.avito.ru/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok || !payload || typeof payload !== 'object' || !('access_token' in payload) || typeof payload.access_token !== 'string') {
    throw new Error('Avito authorization failed')
  }
  return payload.access_token
}

export async function verifyAvitoConnection() {
  const accessToken = await getAvitoAccessToken()
  const response = await fetch('https://api.avito.ru/core/v1/accounts/self', {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok || !payload || typeof payload !== 'object') throw new Error('Avito account check failed')
  const accountId = 'id' in payload && (typeof payload.id === 'number' || typeof payload.id === 'string') ? String(payload.id) : null
  return accountId ? `Авторизация и профиль проверены · ID ${accountId}` : 'Авторизация Avito проверена.'
}
