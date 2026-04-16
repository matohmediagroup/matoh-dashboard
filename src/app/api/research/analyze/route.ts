export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const ASSEMBLY_AI_API_KEY = process.env.ASSEMBLY_AI_API_KEY
const ANTHROPIC_API_KEY   = process.env.ANTHROPIC_API_KEY

// ── YouTube transcript ────────────────────────────────────────────────────────

async function getYouTubeTranscript(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`
    )
    if (!res.ok) return null
    const data = await res.json() as { events?: { segs?: { utf8?: string }[] }[] }
    if (!data?.events?.length) return null

    const text = (data.events ?? [])
      .flatMap((event: { segs?: { utf8?: string }[] }) => event.segs ?? [])
      .map((seg: { utf8?: string }) => seg.utf8 ?? '')
      .join('')
      .replace(/\n/g, ' ')
      .trim()

    return text || null
  } catch {
    return null
  }
}

// ── AssemblyAI transcript ─────────────────────────────────────────────────────

async function getAssemblyAITranscript(downloadUrl: string): Promise<string | null> {
  if (!ASSEMBLY_AI_API_KEY) return null

  try {
    // Submit
    const submitRes = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'Authorization': ASSEMBLY_AI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ audio_url: downloadUrl, language_detection: true }),
    })
    if (!submitRes.ok) return null
    const submitData = await submitRes.json() as { id?: string }
    const transcriptId = submitData?.id
    if (!transcriptId) return null

    // Poll every 3s up to 30s
    const maxAttempts = 10
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 3000))
      const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: { 'Authorization': ASSEMBLY_AI_API_KEY },
      })
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

  // ── Get transcript ──────────────────────────────────────────────────────────
  let transcript: string | null = null

  if (platform === 'youtube_shorts' || platform === 'youtube') {
    if (videoId) {
      transcript = await getYouTubeTranscript(videoId)
    }
  } else if (platform === 'tiktok' || platform === 'instagram') {
    if (downloadUrl) {
      transcript = await getAssemblyAITranscript(downloadUrl)
    }
  }

  // ── Build Claude prompt ─────────────────────────────────────────────────────
  const engagementRate = views > 0
    ? (((likes + comments) / views) * 100).toFixed(2)
    : '0.00'

  const transcriptSection = transcript
    ? `TRANSCRIPT:\n"${transcript.slice(0, 2000)}"`
    : `NO TRANSCRIPT AVAILABLE — analyze from caption/title and view/engagement metrics only.`

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
  "structure": "...",
  "cta": "...",
  "why_it_worked": ["...", "...", "..."],
  "what_to_steal": "...",
  "watch_out": "..."
}

verdict must be "strong", "average", or "weak". score is 1-10. All other fields are strings/arrays of strings.`

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
    // Try to extract JSON block with regex
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        analysis = JSON.parse(match[0])
      } catch {
        return NextResponse.json({ error: 'parse_failed', raw })
      }
    } else {
      return NextResponse.json({ error: 'parse_failed', raw })
    }
  }

  return NextResponse.json({ transcript, analysis })
}
