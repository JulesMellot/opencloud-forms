import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHandler } from './server.ts'

test('HTTP routes handle health checks, malformed URLs and malformed bodies', async () => {
  const server = createServer(
    createHandler({
      opencloudUrl: 'https://cloud.test',
      secret: 'test-secret-with-at-least-32-characters'
    })
  )
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}`
  try {
    for (const path of ['/healthz', '/forms-api/healthz']) {
      const response = await fetch(base + path)
      assert.equal(response.status, 200)
      assert.equal((await response.json()).status, 'ok')
    }
    const malformed = await fetch(base + '/forms-api/v1/public/%ZZ')
    assert.equal(malformed.status, 400)
    assert.deepEqual(await malformed.json(), { error: 'malformedUrl' })
    const body = await fetch(base + '/forms-api/v1/seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{'
    })
    assert.equal(body.status, 400)
    assert.deepEqual(await body.json(), { error: 'malformedBody' })
    const spanish = await fetch(base + '/forms-api/p/token', {
      headers: { 'Accept-Language': 'es-MX,fr;q=0.8' }
    })
    assert.match(await spanish.text(), /<html lang="es">/)
    const german = await fetch(base + '/forms-api/p/token?lang=de', {
      headers: { 'Accept-Language': 'fr' }
    })
    assert.match(await german.text(), /<html lang="de">/)
    const page = await fetch(base + '/forms-api/p/token')
    assert.equal(page.status, 200)
    assert.match(page.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/)
    assert.match(await page.text(), /response-form/)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
})
