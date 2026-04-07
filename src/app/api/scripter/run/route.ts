export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SCRIPTER_URL = process.env.DEALER_SCRIPTER_URL!
const SCRIPTER_PASSWORD = process.env.DEALER_SCRIPTER_PASSWORD!

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

  // Trigger the dealer-scripter run (fire and forget — poll separately)
  try {
    const res = await fetch(`${SCRIPTER_URL}/run/${dealer_key}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `session=${SCRIPTER_PASSWORD}`,
      },
    })
    const data = await res.json() as { job_id?: string }

    if (data?.job_id && record) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('generated_scripts') as any)
        .update({ job_id: data.job_id })
        .eq('id', record.id)
    }

    return NextResponse.json({ success: true, record_id: record?.id, job_id: data?.job_id })
  } catch (e) {
    if (record) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('generated_scripts') as any).update({ status: 'error' }).eq('id', record.id)
    }
    return NextResponse.json({ error: 'Failed to trigger scripter' }, { status: 500 })
  }
}
