import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const APIFY_TOKEN = process.env.APIFY_API_TOKEN!
const YOUTUBE_KEY = process.env.YOUTUBE_API_KEY!

// Apify actor IDs
const ACTORS = {
  tiktok: 'clockworks~free-tiktok-scraper',
  instagram: 'apify~instagram-profile-scraper',
}

async function runApifyActor(actorId: string, input: object): Promise<object | null> {
  try {
    // Start the run
    const startRes = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }
    )
    const startData = await startRes.json() as { data?: { id?: string } }
    const runId = startData?.data?.id
    if (!runId) return null

    // Poll until finished (max 60s)
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000))
      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
      )
      const statusData = await statusRes.json() as { data?: { status?: string; defaultDatasetId?: string } }
      const status = statusData?.data?.status
      if (status === 'SUCCEEDED') {
        const datasetId = statusData?.data?.defaultDatasetId
        const itemsRes = await fetch(
          `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=20`
        )
        return await itemsRes.json()
      }
      if (status === 'FAILED' || status === 'ABORTED') return null
    }
    return null
  } catch {
    return null
  }
}

async function fetchTikTokStats(handle: string) {
  const username = handle.replace('@', '')
  const data = await runApifyActor(ACTORS.tiktok, {
    profiles: [username],
    resultsPerPage: 20,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
  }) as any[]

  if (!data?.length) return null

  const profile = data[0]
  const videos = data.slice(0, 20).map((v: any) => ({
    title: v.text || v.desc || '',
    views: v.playCount || v.stats?.playCount || 0,
    likes: v.diggCount || v.stats?.diggCount || 0,
    comments: v.commentCount || v.stats?.commentCount || 0,
    url: v.webVideoUrl || v.video?.playAddr || '',
    thumbnail: v.video?.cover || v.covers?.default || '',
    date: v.createTime ? new Date(v.createTime * 1000).toISOString() : null,
  }))

  const totalViews = videos.reduce((s: number, v: any) => s + v.views, 0)

  return {
    followers: profile.authorMeta?.fans || profile.fans || 0,
    total_views: totalViews,
    avg_views: videos.length > 0 ? Math.round(totalViews / videos.length) : 0,
    post_count: profile.authorMeta?.video || videos.length,
    latest_videos: videos,
  }
}

async function fetchInstagramStats(handle: string) {
  const username = handle.replace('@', '')
  const data = await runApifyActor(ACTORS.instagram, {
    usernames: [username],
  }) as any[]

  if (!data?.length) return null

  const profile = data[0]
  const posts = (profile.latestPosts || profile.posts || []).slice(0, 20).map((p: any) => ({
    title: p.caption?.slice(0, 100) || '',
    views: p.videoViewCount || p.videoPlayCount || 0,
    likes: p.likesCount || p.likes || 0,
    comments: p.commentsCount || p.comments || 0,
    url: p.url || p.shortCode ? `https://instagram.com/p/${p.shortCode}` : '',
    thumbnail: p.displayUrl || p.thumbnailUrl || '',
    date: p.timestamp || p.takenAt || null,
  }))

  const totalViews = posts.reduce((s: number, p: any) => s + p.views, 0)

  return {
    followers: profile.followersCount || profile.followers || 0,
    total_views: totalViews,
    avg_views: posts.length > 0 ? Math.round(totalViews / posts.length) : 0,
    post_count: profile.postsCount || profile.mediaCount || posts.length,
    latest_videos: posts,
  }
}

async function fetchYouTubeStats(handle: string) {
  try {
    // Resolve channel ID from handle/username
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(handle)}&type=channel&maxResults=1&key=${YOUTUBE_KEY}`
    )
    const searchData = await searchRes.json() as { items?: { id?: { channelId?: string } }[] }
    const channelId = searchData?.items?.[0]?.id?.channelId
    if (!channelId) return null

    // Get channel stats
    const [channelRes, videosRes] = await Promise.all([
      fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${YOUTUBE_KEY}`),
      fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&order=date&maxResults=20&key=${YOUTUBE_KEY}`),
    ])

    const channelData = await channelRes.json() as { items?: { statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string } }[] }
    const videosData = await videosRes.json() as { items?: { id?: { videoId?: string }; snippet?: { title?: string; thumbnails?: { medium?: { url?: string } }; publishedAt?: string } }[] }

    const stats = channelData?.items?.[0]?.statistics
    const videoItems = videosData?.items ?? []

    // Get video stats
    const videoIds = videoItems.map((v: any) => v.id?.videoId).filter(Boolean).join(',')
    let videos: object[] = []
    if (videoIds) {
      const statsRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds}&key=${YOUTUBE_KEY}`
      )
      const statsData = await statsRes.json() as { items?: any[] }
      videos = (statsData?.items ?? []).map((v: any) => ({
        title: v.snippet?.title || '',
        views: parseInt(v.statistics?.viewCount || '0'),
        likes: parseInt(v.statistics?.likeCount || '0'),
        comments: parseInt(v.statistics?.commentCount || '0'),
        url: `https://youtube.com/watch?v=${v.id}`,
        thumbnail: v.snippet?.thumbnails?.medium?.url || '',
        date: v.snippet?.publishedAt || null,
      }))
    }

    const totalViews = videos.reduce((s: number, v: any) => s + v.views, 0)

    return {
      followers: parseInt(stats?.subscriberCount || '0'),
      total_views: parseInt(stats?.viewCount || '0'),
      avg_views: videos.length > 0 ? Math.round(totalViews / videos.length) : 0,
      post_count: parseInt(stats?.videoCount || '0'),
      latest_videos: videos,
    }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { client_id, platform } = await req.json()

  if (!client_id || !platform) {
    return NextResponse.json({ error: 'client_id and platform required' }, { status: 400 })
  }

  // Get handle
  const { data: account } = await supabase
    .from('social_accounts')
    .select('handle')
    .eq('client_id', client_id)
    .eq('platform', platform)
    .single()

  if (!account?.handle) {
    return NextResponse.json({ error: 'No handle configured for this platform' }, { status: 404 })
  }

  let stats = null
  if (platform === 'tiktok') stats = await fetchTikTokStats(account.handle)
  if (platform === 'instagram') stats = await fetchInstagramStats(account.handle)
  if (platform === 'youtube') stats = await fetchYouTubeStats(account.handle)

  if (!stats) {
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }

  // Upsert stats
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('social_stats') as any).upsert({
    client_id,
    platform,
    ...stats,
    refreshed_at: new Date().toISOString(),
  }, { onConflict: 'client_id,platform' })

  return NextResponse.json({ success: true, stats })
}
