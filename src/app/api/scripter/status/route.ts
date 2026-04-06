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
    const data = await res.json() as { status?: string; scripts?: object[] }

    if (data?.status === 'done' && data?.scripts?.length) {
      await supabase
        .from('generated_scripts')
        .update({ status: 'done', scripts: data.scripts })
        .eq('id', record_id)
    } else if (data?.status === 'error') {
      await supabase
        .from('generated_scripts')
        .update({ status: 'error' })
        .eq('id', record_id)
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Failed to poll job' }, { status: 500 })
  }
}
