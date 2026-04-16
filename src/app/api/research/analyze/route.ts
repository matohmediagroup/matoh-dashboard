export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const ASSEMBLY_AI_API_KEY = process.env.ASSEMBLY_AI_API_KEY
const ANTHROPIC_API_KEY   = process.env.ANTHROPIC_API_KEY

// ── Step 1: Upload binary to AssemblyAI storage ───────────────────────────────
// For TikTok/Instagram: CDN URLs are short-lived and block external access.
// We download the video on our server and upload it to AssemblyAI so they
// always have a stable, accessible file to transcribe.

async function uploadBinaryToAssemblyAI(buffer: ArrayBuffer): Promise<string | null> {
  if (!ASSEMBLY_AI_API_KEY) return null
  try {
    const res = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: {
        'Authorization': ASSEMBLY_AI_API_KEY,
        'Content-Type': 'application/octet-stream',
      },
      body: buffer,
    })
    if (!res.ok) return null
    const data = await res.json() as { upload_url?: string }
    return data.upload_url || null
  } catch {
    return null
  }
}

// ── Step 2: Download video from platform CDN ──────────────────────────────────

async function downloadVideo(url: string, platform: string): Promise<ArrayBuffer | null> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
    }
    if (platform === 'tiktok') {
      headers['Referer'] = 'https://www.tiktok.com/'
      headers['Origin']  = 'https://www.tiktok.com'
    } else if (platform === 'instagram') {
      headers['Referer'] = 'https://www.instagram.com/'
      headers['Origin']  = 'https://www.instagram.com'
    }
    const res = await fetch(url, { headers })
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

// ── Step 3: Submit to AssemblyAI and poll ─────────────────────────────────────

async function transcribeWithAssemblyAI(audioUrl: string): Promise<string | null> {
  if (!ASSEMBLY_AI_API_KEY) return null
  try {
    const submitRes = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'Authorization': ASSEMBLY_AI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ audio_url: audioUrl, language_detection: true }),
    })
    if (!submitRes.ok) return null
    const submitData = await submitRes.json() as { id?: string; error?: string }
    if (!submitData?.id) return null

    // Poll every 3s — up to 60s total
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 3000))
      const pollRes = await fetch(
        `https://api.assemblyai.com/v2/transcript/${submitData.id}`,
        { headers: { 'Authorization': ASSEMBLY_AI_API_KEY } }
      )
      if (!pollRes.ok) return null
      const pollData = await pollRes.json() as { status?: string; text?: string }
      if (pollData.status === 'completed') return pollData.text || null
      if (pollData.status === 'error') return null
    }
    return null
  } catch {
    return null
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    platform: string
    videoId?: string
    downloadUrl?: string
    title: string
    views: number
    likes: number
    comments: number
  }

  const { platform, videoId, downloadUrl, title, views, likes, comments } = body

  // ── Transcribe ──────────────────────────────────────────────────────────────
  let transcript: string | null = null
  let transcriptSource: 'assemblyai' | 'none' = 'none'

  if (platform === 'youtube_shorts' || platform === 'youtube') {
    // AssemblyAI natively supports YouTube URLs — pass directly
    if (videoId) {
      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
      transcript = await transcribeWithAssemblyAI(youtubeUrl)
      if (transcript) transcriptSource = 'assemblyai'
    }
  } else if ((platform === 'tiktok' || platform === 'instagram') && downloadUrl) {
    // Download video on our server → upload to AssemblyAI → transcribe
    const buffer = await downloadVideo(downloadUrl, platform)
    if (buffer && buffer.byteLength > 0) {
      const uploadUrl = await uploadBinaryToAssemblyAI(buffer)
      if (uploadUrl) {
        transcript = await transcribeWithAssemblyAI(uploadUrl)
        if (transcript) transcriptSource = 'assemblyai'
      }
    }
  }

  // ── Build Claude prompt ─────────────────────────────────────────────────────
  const engagementRate = views > 0
    ? (((likes + comments) / views) * 100).toFixed(2)
    : '0.00'

  const transcriptSection = transcript
    ? `TRANSCRIPT (real audio transcription):\n"${transcript.slice(0, 3000)}"`
    : `NO TRANSCRIPT AVAILABLE — analyze from caption/title and engagement metrics only.`

  const promptText = `You are a short-form video strategist for a car dealership content agency. Analyze this ${platform} video.

VIDEO DATA:
- Title/Caption: "${title}"
- Views: ${views.toLocaleString()}
- Likes: ${likes.toLocaleString()}
- Comments: ${comments.toLocaleString()}
- Engagement rate: ${engagementRate}%
${transcriptSection}

Respond in this EXACT JSON format (no markdown, just raw JSON):
{
  "verdict": "strong",
  "score": 8,
  "hook": "...",
  "body": "...",
  "cta": "...",
  "why_it_worked": ["...", "...", "..."],
  "what_to_steal": "...",
  "watch_out": "..."
}

Rules:
- verdict: "strong", "average", or "weak"
- score: 1-10
- hook: the ACTUAL opening words/lines from the transcript (verbatim). If no transcript, infer from title.
- body: the ACTUAL main content from the transcript — what is said in the middle (verbatim or close paraphrase). If no transcript, summarize from title.
- cta: the ACTUAL call-to-action words spoken at the end (verbatim). If no transcript, write "No CTA detected".
- why_it_worked: 3 bullet points on WHY this video performed well
- what_to_steal: one specific tactic a car dealership could copy
- watch_out: one thing to avoid or be careful about`

  // ── Call Claude ─────────────────────────────────────────────────────────────
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: 'claude-opus-4-5' as any,
    max_tokens: 1024,
    messages: [{ role: 'user', content: promptText }],
  })

  const raw = (message.content[0] as { type: string; text: string }).text || ''

  // ── Parse response ──────────────────────────────────────────────────────────
  let analysis: object
  try {
    analysis = JSON.parse(raw)
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      try { analysis = JSON.parse(match[0]) }
      catch { return NextResponse.json({ error: 'parse_failed', raw }) }
    } else {
      return NextResponse.json({ error: 'parse_failed', raw })
    }
  }

  return NextResponse.json({ transcript, transcriptSource, analysis })
}
