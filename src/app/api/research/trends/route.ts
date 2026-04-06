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
]

async function fetchYouTubeTopVideos(handle: string, label: string) {
  try {
    // Search for channel
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(handle)}&type=channel&maxResults=1&key=${YOUTUBE_KEY}`
    )
    const searchData = await searchRes.json() as { items?: { id?: { channelId?: string } }[] }
    const channelId = searchData?.items?.[0]?.id?.channelId
    if (!channelId) return []

    // Get recent videos
    const videosRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&order=viewCount&maxResults=5&key=${YOUTUBE_KEY}`
    )
    const videosData = await videosRes.json() as { items?: any[] }
    const videoIds = (videosData?.items ?? []).map((v: any) => v.id?.videoId).filter(Boolean).join(',')
    if (!videoIds) return []

    const statsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds}&key=${YOUTUBE_KEY}`
    )
    const statsData = await statsRes.json() as { items?: any[] }

    return (statsData?.items ?? []).map((v: any) => ({
      handle,
      label,
      platform: 'youtube' as const,
      title: v.snippet?.title || '',
      views: parseInt(v.statistics?.viewCount || '0'),
      likes: parseInt(v.statistics?.likeCount || '0'),
      comments: parseInt(v.statistics?.commentCount || '0'),
      url: `https://youtube.com/watch?v=${v.id}`,
      thumbnail: v.snippet?.thumbnails?.medium?.url || '',
      date: v.snippet?.publishedAt || '',
    }))
  } catch {
    return []
  }
}

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

    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 3000))
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`)
      const statusData = await statusRes.json() as { data?: { status?: string; defaultDatasetId?: string } }
      if (statusData?.data?.status === 'SUCCEEDED') {
        const itemsRes = await fetch(
          `https://api.apify.com/v2/datasets/${statusData.data.defaultDatasetId}/items?token=${APIFY_TOKEN}&limit=5`
        )
        const items = await itemsRes.json() as any[]
        return items.map((v: any) => ({
          handle,
          label,
          platform: 'tiktok' as const,
          title: v.text || v.desc || '',
          views: v.playCount || 0,
          likes: v.diggCount || 0,
          comments: v.commentCount || 0,
          url: v.webVideoUrl || '',
          thumbnail: v.video?.cover || '',
          date: v.createTime ? new Date(v.createTime * 1000).toISOString() : '',
        }))
      }
      if (statusData?.data?.status === 'FAILED') return []
    }
    return []
  } catch {
    return []
  }
}

export async function GET() {
  const results = await Promise.all([
    ...YOUTUBE_COMPETITORS.map(c => fetchYouTubeTopVideos(c.handle, c.label)),
    ...TIKTOK_COMPETITORS.map(c => fetchTikTokTopVideos(c.handle, c.label)),
  ])

  const all = results.flat().sort((a, b) => b.views - a.views)
  return NextResponse.json(all)
}
