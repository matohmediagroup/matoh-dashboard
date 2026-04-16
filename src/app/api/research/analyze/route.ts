export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const ASSEMBLY_AI_API_KEY = process.env.ASSEMBLY_AI_API_KEY
const ANTHROPIC_API_KEY   = process.env.ANTHROPIC_API_KEY

// ── YouTube captions ──────────────────────────────────────────────────────────
// AssemblyAI does NOT support YouTube page URLs — it needs a direct audio file.
// YouTube's timedtext API returns the same ASR output YouTube uses internally.

async function getYouTubeCaptions(videoId: string): Promise<{ text: string; source: 'captions' } | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`
    )
    if (!res.ok) return null
    const data = await res.json() as { events?: { segs?: { utf8?: string }[] }[] }
    if (!data?.events?.length) return null

    const text = data.events
      .flatMap(e => e.segs ?? [])
      .map(s => s.utf8 ?? '')
      .join('')
      .replace(/\n/g, ' ')
      .trim()

    return text ? { text, source: 'captions' } : null
  } catch {
    return null
  }
}

// ── TikTok / Instagram: download → upload → AssemblyAI ───────────────────────
// CDN URLs from these platforms expire and block external fetches.
// We download the video on our server first, upload it to AssemblyAI storage,
// then transcribe from the stable upload URL.

async function downloadVideo(url: string, platform: string): Promise<ArrayBuffer | null> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8',
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

    const buffer = await res.arrayBuffer()
    return buffer.byteLength > 1000 ? buffer : null  // reject empty/error responses
  } catch {
    return null
  }
}

async function uploadToAssemblyAI(buffer: ArrayBuffer): Promise<string | null> {
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

    // Poll every 3s — up to 60s
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

async function transcribeVideoUrl(
  downloadUrl: string,
  platform: string
): Promise<{ text: string; source: 'assemblyai' } | null> {
  const buffer = await downloadVideo(downloadUrl, platform)
  if (!buffer) return null

  const uploadUrl = await uploadToAssemblyAI(buffer)
  if (!uploadUrl) return null

  const text = await transcribeWithAssemblyAI(uploadUrl)
  return text ? { text, source: 'assemblyai' } : null
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
  let transcriptText: string | null = null
  let transcriptSource: 'assemblyai' | 'captions' | 'none' = 'none'

  if (platform === 'youtube_shorts' || platform === 'youtube') {
    if (videoId) {
      const result = await getYouTubeCaptions(videoId)
      if (result) { transcriptText = result.text; transcriptSource = result.source }
    }
  } else if ((platform === 'tiktok' || platform === 'instagram') && downloadUrl) {
    const result = await transcribeVideoUrl(downloadUrl, platform)
    if (result) { transcriptText = result.text; transcriptSource = result.source }
  }

  // ── Build Claude prompt ─────────────────────────────────────────────────────
  const engagementRate = views > 0
    ? (((likes + comments) / views) * 100).toFixed(2)
    : '0.00'

  const transcriptSection = transcriptText
    ? `TRANSCRIPT:\n"${transcriptText.slice(0, 3000)}"`
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
- body: the ACTUAL main content from the transcript — what is said in the middle. If no transcript, summarize from title.
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

  return NextResponse.json({ transcript: transcriptText, transcriptSource, analysis })
}
