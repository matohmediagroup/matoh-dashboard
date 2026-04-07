export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

const SCRIPTER_URL = process.env.DEALER_SCRIPTER_URL!
const SCRIPTER_PASSWORD = process.env.DEALER_SCRIPTER_PASSWORD!

export async function GET() {
  const steps: { step: string; ok: boolean; detail: string }[] = []

  // Step 1: ping the server
  try {
    const start = Date.now()
    const res = await fetch(`${SCRIPTER_URL}/`, { signal: AbortSignal.timeout(15000) })
    const text = await res.text()
    steps.push({ step: 'Server reachable', ok: res.ok || res.status < 500, detail: `HTTP ${res.status} in ${Date.now() - start}ms` })

    // Step 2: try login
    try {
      const loginRes = await fetch(`${SCRIPTER_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: SCRIPTER_PASSWORD }),
        redirect: 'manual',
      })
      const loginText = await loginRes.text()
      const hasCookie = !!loginRes.headers.get('set-cookie')
      steps.push({
        step: 'Login',
        ok: loginRes.status < 400 || hasCookie,
        detail: `HTTP ${loginRes.status} · cookie=${hasCookie} · ${loginText.slice(0, 120)}`,
      })

      // Step 3: list available endpoints (try /status or /health)
      const cookie = loginRes.headers.get('set-cookie')?.match(/session=[^;]+/)?.[0]
      const statusRes = await fetch(`${SCRIPTER_URL}/status`, {
        headers: cookie ? { Cookie: cookie } : {},
      })
      const statusText = await statusRes.text()
      steps.push({
        step: 'GET /status',
        ok: statusRes.status < 500,
        detail: `HTTP ${statusRes.status} · ${statusText.slice(0, 200)}`,
      })
    } catch (e) {
      steps.push({ step: 'Login', ok: false, detail: String(e) })
    }
  } catch (e) {
    steps.push({ step: 'Server reachable', ok: false, detail: String(e) })
  }

  return NextResponse.json({ url: SCRIPTER_URL, steps })
}
