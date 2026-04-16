export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'

const YOUTUBE_KEY = process.env.YOUTUBE_API_KEY!
const APIFY_TOKEN = process.env.APIFY_API_TOKEN!

const YOUTUBE_COMPETITORS = [
  { handle: 'supercarblondie', label: 'Supercar Blondie' },
  { handle: 'TFLcar',          label: 'TFL Car' },
  { handle: 'carwow',          label: 'Carwow' },
  { handle: 'VINwiki',         label: 'VINwiki' },
  { handle: 'MotorTrend',      label: 'MotorTrend' },
  { handle: 'donutmedia',      label: 'Donut Media' },
]

const TIKTOK_COMPETITORS = [
  { handle: 'milesperhr',  label: 'Miles Per Hr' },
  { handle: 'omardrives',  label: 'Omar Drives' },
  { handle: 'carthrottle', label: 'Car Throttle' },
  { handle: 'carscouted',  label: 'Car Scouted' },
]

const INSTAGRAM_COMPETITORS = [
  { handle: 'supercarblondie', label: 'Supercar Blondie' },
  { handle: 'carthrottle',     label: 'Car Throttle' },
  { handle: 'motortrend',      label: 'MotorTrend' },
  { handle: 'carwow',          label: 'Carwow' },
  { handle: 'throtl',          label: 'Throtl' },
]

async function pollApifyRun(runId: string, maxWaitMs = 45000): Promise<string | null> {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 3000))
    const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`)
    const d = await res.json() as { data?: { status?: string; defaultDatasetId?: string } }
    if (d?.data?.status === 'SUCCEEDED') return d.data.defaultDatasetId || null
    if (d?.data?.status === 'FAILED' || d?.data?.status === 'ABORTED') return null
  }
  return null
}

// ── YouTube Shorts ──────────────────────────────────────────────────────────

async function fetchYouTubeShorts(handle: string, label: string) {
  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(handle)}&type=channel&maxResults=1&key=${YOUTUBE_KEY}`
    )
    const searchData = await searchRes.json() as { items?: { id?: { channelId?: string } }[] }
    const channelId = searchData?.items?.[0]?.id?.channelId
    if (!channelId) return []

    const videosRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&q=%23shorts&type=video&videoDuration=short&order=viewCount&maxResults=5&key=${YOUTUBE_KEY}`
    )
    const videosData = await videosRes.json() as { items?: any[] }
    const videoIds = (videosData?.items ?? []).map((v: any) => v.id?.videoId).filter(Boolean).join(',')
    if (!videoIds) return []

    const statsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails&id=${videoIds}&key=${YOUTUBE_KEY}`
    )
    const statsData = await statsRes.json() as { items?: any[] }

    return (statsData?.items ?? [])
      .filter((v: any) => {
        const dur = v.contentDetails?.duration || ''
        const match = dur.match(/PT(?:(\d+)M)?(?:(\d+)S)?/)
        if (!match) return true
        return parseInt(match[1] || '0') === 0 && parseInt(match[2] || '0') <= 90
      })
      .map((v: any) => ({
        handle, label, platform: 'youtube_shorts' as const,
        title: v.snippet?.title || '',
        views: parseInt(v.statistics?.viewCount || '0'),
        likes: parseInt(v.statistics?.likeCount || '0'),
        comments: parseInt(v.statistics?.commentCount || '0'),
        url: `https://youtube.com/shorts/${v.id}`,
        thumbnail: v.snippet?.thumbnails?.medium?.url || '',
        date: v.snippet?.publishedAt || '',
        downloadUrl: '',
      }))
  } catch { return [] }
}

// ── TikTok (Apify) ───────────────────────────────────────────────────────────

async function fetchTikTokTopVideos(handle: string, label: string) {
  try {
    const startRes = await fetch(
      `https://api.apify.com/v2/acts/clockworks~free-tiktok-scraper/runs?token=${APIFY_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profiles: [handle], resultsPerPage: 5, shouldDownloadVideos: false }),
      }
    )
    const startData = await startRes.json() as { data?: { id?: string } }
    const runId = startData?.data?.id
    if (!runId) return []

    const datasetId = await pollApifyRun(runId)
    if (!datasetId) return []

    const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=5`)
    const items = await itemsRes.json() as any[]
    return items.map((v: any) => ({
      handle, label, platform: 'tiktok' as const,
      title: v.text || v.desc || '',
      views: v.playCount || 0,
      likes: v.diggCount || 0,
      comments: v.commentCount || 0,
      url: v.webVideoUrl || '',
      thumbnail: v.video?.cover || '',
      date: v.createTime ? new Date(v.createTime * 1000).toISOString() : '',
      downloadUrl: v.video?.playAddr || v.video?.downloadAddr || '',
    }))
  } catch { return [] }
}

// ── Instagram (Apify) ────────────────────────────────────────────────────────

async function fetchInstagramReels(handle: string, label: string) {
  try {
    const startRes = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=${APIFY_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directUrls: [`https://www.instagram.com/${handle}/reels/`],
          resultsType: 'posts',
          resultsLimit: 5,
        }),
      }
    )
    const startData = await startRes.json() as { data?: { id?: string } }
    const runId = startData?.data?.id
    if (!runId) return []

    const datasetId = await pollApifyRun(runId)
    if (!datasetId) return []

    const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=5`)
    const items = await itemsRes.json() as any[]
    return items
      .filter((v: any) => v.type === 'Video' || v.productType === 'clips')
      .map((v: any) => ({
        handle, label, platform: 'instagram' as const,
        title: v.caption || v.alt || '',
        views: v.videoPlayCount || v.likesCount || 0,
        likes: v.likesCount || 0,
        comments: v.commentsCount || 0,
        url: v.url || `https://instagram.com/p/${v.shortCode}`,
        thumbnail: v.displayUrl || '',
        date: v.timestamp || '',
        downloadUrl: v.videoUrl || '',
      }))
  } catch { return [] }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET() {
  const results = await Promise.all([
    ...YOUTUBE_COMPETITORS.map(c => fetchYouTubeShorts(c.handle, c.label)),
    ...TIKTOK_COMPETITORS.map(c => fetchTikTokTopVideos(c.handle, c.label)),
    ...INSTAGRAM_COMPETITORS.map(c => fetchInstagramReels(c.handle, c.label)),
  ])

  const all = results.flat().sort((a, b) => b.views - a.views)
  return NextResponse.json(all)
}
