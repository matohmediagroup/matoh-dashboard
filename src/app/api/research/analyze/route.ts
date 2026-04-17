export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const ASSEMBLY_AI_API_KEY = process.env.ASSEMBLY_AI_API_KEY
const ANTHROPIC_API_KEY   = process.env.ANTHROPIC_API_KEY
const APIFY_TOKEN         = process.env.APIFY_API_TOKEN

// ── YouTube: timedtext captions ───────────────────────────────────────────────

async function getYouTubeCaptions(videoId: string): Promise<string | null> {
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
    return text || null
  } catch { return null }
}

// ── TikTok: Apify scrape with shouldDownloadVideos → KV store → download ──────
// TikTok CDN URLs require session cookies and expire quickly.
// When shouldDownloadVideos=true, Apify downloads and stores the file in their
// own Key-Value Store — accessible with just our API token, no TikTok auth needed.

async function getTikTokBuffer(tiktokPageUrl: string): Promise<ArrayBuffer | null> {
  if (!APIFY_TOKEN) return null
  try {
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/clockworks~free-tiktok-scraper/runs?token=${APIFY_TOKEN}&waitForFinish=60`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postURLs: [tiktokPageUrl],
          shouldDownloadVideos: true,
          shouldDownloadCovers: false,
        }),
      }
    )
    const runData = await runRes.json() as {
      data?: { status?: string; defaultKeyValueStoreId?: string }
    }
    if (runData?.data?.status !== 'SUCCEEDED') return null

    const kvStoreId = runData.data!.defaultKeyValueStoreId
    if (!kvStoreId) return null

    // List records in the KV store — find the video file (not the INPUT record)
    const keysRes = await fetch(
      `https://api.apify.com/v2/key-value-stores/${kvStoreId}/keys?token=${APIFY_TOKEN}&limit=100`
    )
    const keysData = await keysRes.json() as {
      data?: { items?: { key: string; contentType?: string }[] }
    }
    const videoRecord = (keysData.data?.items ?? []).find(item => {
      const ct = item.contentType || ''
      return ct.startsWith('video/') ||
             item.key.match(/\.(mp4|webm|mov)$/i) ||
             (ct.includes('octet-stream') && item.key !== 'INPUT')
    })
    if (!videoRecord) return null

    // Download the video directly from Apify's storage
    const videoRes = await fetch(
      `https://api.apify.com/v2/key-value-stores/${kvStoreId}/records/${encodeURIComponent(videoRecord.key)}?token=${APIFY_TOKEN}`
    )
    if (!videoRes.ok) return null
    const buffer = await videoRes.arrayBuffer()
    return buffer.byteLength > 1000 ? buffer : null
  } catch { return null }
}

// ── Instagram: Apify scrape → videoUrl (no cookies needed for public posts) ───

async function getInstagramBuffer(postUrl: string): Promise<ArrayBuffer | null> {
  if (!APIFY_TOKEN) return null
  try {
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=${APIFY_TOKEN}&waitForFinish=50`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directUrls: [postUrl],
          resultsType: 'posts',
          resultsLimit: 1,
        }),
      }
    )
    const runData = await runRes.json() as {
      data?: { status?: string; defaultDatasetId?: string }
    }
    if (runData?.data?.status !== 'SUCCEEDED') return null

    const itemsRes = await fetch(
      `https://api.apify.com/v2/datasets/${runData.data!.defaultDatasetId}/items?token=${APIFY_TOKEN}&limit=1`
    )
    const items = await itemsRes.json() as any[]
    // videoUrl is the Instagram CDN URL — accessible without cookies on public posts
    const videoUrl: string | undefined = items[0]?.videoUrl || items[0]?.video_url
    if (!videoUrl) return null

    const videoRes = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.instagram.com/',
      },
    })
    if (!videoRes.ok) return null
    const buffer = await videoRes.arrayBuffer()
    return buffer.byteLength > 1000 ? buffer : null
  } catch { return null }
}

// ── AssemblyAI: upload buffer → transcribe ────────────────────────────────────

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
  } catch { return null }
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
    const submitData = await submitRes.json() as { id?: string }
    if (!submitData?.id) return null

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
  } catch { return null }
}

async function transcribeBuffer(buffer: ArrayBuffer): Promise<string | null> {
  const uploadUrl = await uploadToAssemblyAI(buffer)
  if (!uploadUrl) return null
  return transcribeWithAssemblyAI(uploadUrl)
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    platform: string
    videoId?: string
    videoUrl?: string
    downloadUrl?: string
    title: string
    views: number
    likes: number
    comments: number
  }

  const { platform, videoId, videoUrl, title, views, likes, comments } = body

  let transcriptText: string | null = null
  let transcriptSource: 'assemblyai' | 'captions' | 'none' = 'none'

  if (platform === 'youtube_shorts' || platform === 'youtube') {
    if (videoId) {
      transcriptText = await getYouTubeCaptions(videoId)
      if (transcriptText) transcriptSource = 'captions'
    }

  } else if (platform === 'tiktok' && videoUrl) {
    // Apify downloads the video into their KV store — no TikTok CDN auth issues
    const buffer = await getTikTokBuffer(videoUrl)
    if (buffer) {
      transcriptText = await transcribeBuffer(buffer)
      if (transcriptText) transcriptSource = 'assemblyai'
    }

  } else if (platform === 'instagram' && videoUrl) {
    // Apify scrapes fresh videoUrl — Instagram CDN works without cookies on public posts
    const buffer = await getInstagramBuffer(videoUrl)
    if (buffer) {
      transcriptText = await transcribeBuffer(buffer)
      if (transcriptText) transcriptSource = 'assemblyai'
    }
  }

  // ── Build Claude prompt ─────────────────────────────────────────────────────
  const engagementRate = views > 0
    ? (((likes + comments) / views) * 100).toFixed(2)
    : '0.00'

  const transcriptSection = transcriptText
    ? `TRANSCRIPT (real audio transcription):\n"${transcriptText.slice(0, 3000)}"`
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
- hook: the ACTUAL opening words/lines from the transcript (verbatim quote). If no transcript, infer from title.
- body: the ACTUAL main content from the transcript — what is said in the middle. If no transcript, summarize from title.
- cta: the ACTUAL call-to-action words spoken at the end (verbatim quote). If no transcript, write "No CTA detected".
- why_it_worked: 3 bullet points on WHY this video performed well
- what_to_steal: one specific tactic a car dealership could copy
- watch_out: one thing to avoid or be careful about`

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  const message = await client.messages.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: 'claude-opus-4-5' as any,
    max_tokens: 1024,
    messages: [{ role: 'user', content: promptText }],
  })

  const raw = (message.content[0] as { type: string; text: string }).text || ''

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
