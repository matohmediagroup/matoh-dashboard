export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'

const YOUTUBE_KEY  = process.env.YOUTUBE_API_KEY!
const APIFY_TOKEN  = process.env.APIFY_API_TOKEN!

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

// ── YouTube ────────────────────────────────────────────────────────────────────

async function searchYouTube(query: string, isHandle: boolean) {
  try {
    let channelId: string | null = null

    if (isHandle) {
      // Look up channel by handle/username
      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=channel&maxResults=1&key=${YOUTUBE_KEY}`
      )
      const searchData = await searchRes.json() as { items?: { id?: { channelId?: string }; snippet?: { title?: string } }[] }
      channelId = searchData?.items?.[0]?.id?.channelId || null
    }

    // Build search URL
    const searchUrl = channelId
      ? `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&q=%23shorts&type=video&videoDuration=short&order=viewCount&maxResults=10&key=${YOUTUBE_KEY}`
      : `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query + ' shorts')}&type=video&videoDuration=short&order=viewCount&maxResults=10&key=${YOUTUBE_KEY}`

    const videosRes = await fetch(searchUrl)
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
        handle: isHandle ? `@${query}` : 'YouTube Search',
        label: v.snippet?.channelTitle || query,
        platform: 'youtube_shorts' as const,
        title: v.snippet?.title || '',
        views: parseInt(v.statistics?.viewCount || '0'),
        likes: parseInt(v.statistics?.likeCount || '0'),
        comments: parseInt(v.statistics?.commentCount || '0'),
        url: `https://youtube.com/shorts/${v.id}`,
        thumbnail: v.snippet?.thumbnails?.medium?.url || '',
        date: v.snippet?.publishedAt || '',
      }))
  } catch { return [] }
}

// ── TikTok (via Apify) ────────────────────────────────────────────────────────

async function searchTikTok(query: string, isHandle: boolean) {
  try {
    const body = isHandle
      ? { profiles: [query], resultsPerPage: 10, shouldDownloadVideos: false }
      : { searchQueries: [query], resultsPerPage: 10, shouldDownloadVideos: false }

    const startRes = await fetch(
      `https://api.apify.com/v2/acts/clockworks~free-tiktok-scraper/runs?token=${APIFY_TOKEN}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    )
    const startData = await startRes.json() as { data?: { id?: string } }
    const runId = startData?.data?.id
    if (!runId) return []

    const datasetId = await pollApifyRun(runId)
    if (!datasetId) return []

    const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=10`)
    const items = await itemsRes.json() as any[]
    return items.map((v: any) => ({
      handle: isHandle ? `@${query}` : 'TikTok Search',
      label: v.authorMeta?.name || query,
      platform: 'tiktok' as const,
      title: v.text || v.desc || '',
      views: v.playCount || 0,
      likes: v.diggCount || 0,
      comments: v.commentCount || 0,
      url: v.webVideoUrl || `https://tiktok.com/@${query}`,
      thumbnail: v.video?.cover || '',
      date: v.createTime ? new Date(v.createTime * 1000).toISOString() : '',
    }))
  } catch { return [] }
}

// ── Instagram (via Apify) ─────────────────────────────────────────────────────

async function searchInstagram(query: string, isHandle: boolean) {
  try {
    const directUrl = isHandle
      ? `https://www.instagram.com/${query}/reels/`
      : `https://www.instagram.com/explore/tags/${encodeURIComponent(query)}/`

    const startRes = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=${APIFY_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directUrls: [directUrl], resultsType: 'posts', resultsLimit: 10 }),
      }
    )
    const startData = await startRes.json() as { data?: { id?: string } }
    const runId = startData?.data?.id
    if (!runId) return []

    const datasetId = await pollApifyRun(runId)
    if (!datasetId) return []

    const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=10`)
    const items = await itemsRes.json() as any[]
    return items
      .filter((v: any) => v.type === 'Video' || v.productType === 'clips' || v.isVideo)
      .map((v: any) => ({
        handle: isHandle ? `@${query}` : `#${query}`,
        label: v.ownerUsername || query,
        platform: 'instagram' as const,
        title: v.caption || v.alt || '',
        views: v.videoPlayCount || v.likesCount || 0,
        likes: v.likesCount || 0,
        comments: v.commentsCount || 0,
        url: v.url || `https://instagram.com/p/${v.shortCode}`,
        thumbnail: v.displayUrl || '',
        date: v.timestamp || '',
      }))
  } catch { return [] }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const query = (searchParams.get('q') || '').trim()
  const platforms = (searchParams.get('platforms') || 'youtube').split(',').filter(Boolean)

  if (!query) return NextResponse.json([])

  const isHandle = query.startsWith('@')
  const cleanQuery = isHandle ? query.slice(1) : query

  const jobs: Promise<any[]>[] = []
  if (platforms.includes('youtube'))   jobs.push(searchYouTube(cleanQuery, isHandle))
  if (platforms.includes('tiktok'))    jobs.push(searchTikTok(cleanQuery, isHandle))
  if (platforms.includes('instagram')) jobs.push(searchInstagram(cleanQuery, isHandle))

  const results = await Promise.all(jobs)
  const all = results.flat().sort((a, b) => b.views - a.views)
  return NextResponse.json(all)
}
