import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGE_SIZE = 8 * 1024 * 1024
const IMAGE_PATH_PATTERN = /^clostore\/images\/[a-f0-9-]+\.(?:jpg|png|webp)$/i

function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const expectedHost = forwardedHost || request.headers.get('host')
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  if (!origin || !expectedHost) return false

  try {
    const originUrl = new URL(origin)
    const expectedProtocol = forwardedProtocol || new URL(request.url).protocol.replace(':', '')
    return originUrl.host === expectedHost && originUrl.protocol === `${expectedProtocol}:`
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  let body: HandleUploadBody

  try {
    const parsedBody = await request.json()
    if (!parsedBody || typeof parsedBody !== 'object' || !('type' in parsedBody)) {
      return NextResponse.json({ error: 'Invalid upload request' }, { status: 400 })
    }
    body = parsedBody as HandleUploadBody
  } catch {
    return NextResponse.json({ error: 'Invalid upload request' }, { status: 400 })
  }

  if (body.type === 'blob.generate-client-token' && !isSameOrigin(request)) {
    return NextResponse.json({ error: 'Upload request origin is not allowed' }, { status: 403 })
  }

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!IMAGE_PATH_PATTERN.test(pathname)) {
          throw new Error('Invalid image path')
        }

        return {
          allowedContentTypes: IMAGE_TYPES,
          maximumSizeInBytes: MAX_IMAGE_SIZE,
          addRandomSuffix: true,
        }
      },
    })

    return NextResponse.json(response)
  } catch {
    return NextResponse.json({ error: 'Could not authorize image upload' }, { status: 400 })
  }
}
