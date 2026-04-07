export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SCRIPTER_URL = process.env.DEALER_SCRIPTER_URL!

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const record_id = searchParams.get('record_id')
  const job_id = searchParams.get('job_id')

  if (!record_id || !job_id) {
    return NextResponse.json({ error: 'record_id and job_id required' }, { status: 400 })
  }

  try {
    const res = await fetch(`${SCRIPTER_URL}/job/${job_id}`)
    const rawText = await res.text()
    let data: { status?: string; scripts?: object[]; logs?: string[]; error?: string; progress?: string } = {}
    try { data = JSON.parse(rawText) } catch { /* not JSON */ }

    if (data?.status === 'done' && data?.scripts?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('generated_scripts') as any)
        .update({ status: 'done', scripts: data.scripts })
        .eq('id', record_id)
    } else if (data?.status === 'error') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('generated_scripts') as any)
        .update({ status: 'error', scripts: [{ _debug: rawText }] })
        .eq('id', record_id)
    }

    return NextResponse.json({ ...data, _raw: rawText, _http_status: res.status })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: errMsg, status: 'error' }, { status: 500 })
  }
}
