export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'

const YOUTUBE_KEY = process.env.YOUTUBE_API_KEY!
const APIFY_TOKEN = process.env.APIFY_API_TOKEN!

// YouTube — uses Google API (fast), can handle more accounts
const YOUTUBE_COMPETITORS = [
  { handle: 'matwatsoncars',              label: 'Mat Watson Cars' },
  { handle: 'omardrives',                 label: 'Omar Drives' },
  { handle: 'forrest.auto.reviews.official', label: 'Forrest Auto Reviews' },
  { handle: 'milesperhr',                 label: 'Miles Per Hr' },
]

// TikTok — Apify jobs (run in parallel, 3 max to stay within 60s)
const TIKTOK_COMPETITORS = [
  { handle: 'milesperhr',    label: 'Miles Per Hr' },
  { handle: 'mattblattkiaab', label: 'Matt Blatt Kia AB' },
  { handle: 'mattblattkiatr', label: 'Matt Blatt Kia TR' },
]

// Instagram — Apify jobs (run in parallel, 3 max to stay within 60s)
const INSTAGRAM_COMPETITORS = [
  { handle: 'porschevirginiabeach', label: 'Porsche Virginia Beach' },
  { handle: 'pushingpistons',       label: 'Pushing Pistons' },
  { handle: 'omardrives',           label: 'Omar Drives' },
]

// Use Apify's built-in waitForFinish instead of manual polling — faster & simpler
async function startApifyAndWait(actorId: string, input: object): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}&waitForFinish=45`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }
    )
    const d = await res.json() as { data?: { status?: string; defaultDatasetId?: string } }
    if (d?.data?.status === 'SUCCEEDED') return d.data.defaultDatasetId || null
    return null
  } catch { return null }
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
    const datasetId = await startApifyAndWait('clockworks~free-tiktok-scraper', {
      profiles: [handle], resultsPerPage: 5, shouldDownloadVideos: false,
    })
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
    const datasetId = await startApifyAndWait('apify~instagram-scraper', {
      directUrls: [`https://www.instagram.com/${handle}/reels/`],
      resultsType: 'posts',
      resultsLimit: 5,
    })
    if (!datasetId) return []
    const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=5`)
    const items = await itemsRes.json() as any[]
    return items
      .filter((v: any) => v.type === 'Video' || v.productType === 'clips' || v.isVideo)
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
