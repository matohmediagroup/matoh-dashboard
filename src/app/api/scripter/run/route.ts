export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SCRIPTER_URL = process.env.DEALER_SCRIPTER_URL!
const SCRIPTER_PASSWORD = process.env.DEALER_SCRIPTER_PASSWORD!

async function getSessionCookie(): Promise<string | null> {
  try {
    const res = await fetch(`${SCRIPTER_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: SCRIPTER_PASSWORD }),
      redirect: 'manual',
    })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) {
      const match = setCookie.match(/session=[^;]+/)
      return match ? match[0] : null
    }
    return null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { client_id, dealer_key } = await req.json()

  if (!client_id || !dealer_key) {
    return NextResponse.json({ error: 'client_id and dealer_key required' }, { status: 400 })
  }

  // Create a pending record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: record } = await (supabase.from('generated_scripts') as any)
    .insert({ client_id, dealer_key, status: 'running', scripts: [] })
    .select()
    .single()

  try {
    // Step 1: authenticate to get session cookie
    const sessionCookie = await getSessionCookie()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (sessionCookie) headers['Cookie'] = sessionCookie

    // Step 2: trigger the run
    const res = await fetch(`${SCRIPTER_URL}/run/${dealer_key}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ password: SCRIPTER_PASSWORD }),
    })

    const rawText = await res.text()
    let data: { job_id?: string; error?: string } = {}
    try { data = JSON.parse(rawText) } catch { /* not JSON */ }

    if (data?.job_id && record) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('generated_scripts') as any)
        .update({ job_id: data.job_id })
        .eq('id', record.id)
    } else if (record) {
      // Store the raw error response for debugging
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('generated_scripts') as any)
        .update({ status: 'error', scripts: [{ _debug: rawText, _status: res.status }] })
        .eq('id', record.id)
    }

    return NextResponse.json({
      success: !!data?.job_id,
      record_id: record?.id,
      job_id: data?.job_id,
      debug: { status: res.status, raw: rawText, had_cookie: !!sessionCookie },
    })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    if (record) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('generated_scripts') as any)
        .update({ status: 'error', scripts: [{ _debug: errMsg }] })
        .eq('id', record.id)
    }
    return NextResponse.json({ error: errMsg, record_id: record?.id }, { status: 500 })
  }
}
