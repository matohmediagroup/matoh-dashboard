export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const APIFY_TOKEN = process.env.APIFY_API_TOKEN!
const YOUTUBE_KEY = process.env.YOUTUBE_API_KEY!

const ACTORS = {
  tiktok:    'clockworks~free-tiktok-scraper',
  instagram: 'apify~instagram-profile-scraper',
}

function thirtyDaysAgo(): Date {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
}

// Validate a date string: must be parseable, not in the future, not before 2020
function isValidRecentDate(dateStr: string): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return false
  if (d > new Date()) return false                          // no future dates
  if (d < new Date('2020-01-01')) return false              // no ancient dates
  return true
}

function isWithin30Days(dateStr: string, cutoff: Date): boolean {
  if (!isValidRecentDate(dateStr)) return false
  return new Date(dateStr) >= cutoff
}

// ── Apify helper ──────────────────────────────────────────────────────────────

async function runApifyActor(actorId: string, input: object): Promise<object | null> {
  try {
    const startRes = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}&waitForFinish=90`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }
    )
    const startData = await startRes.json() as { data?: { status?: string; defaultDatasetId?: string } }
    if (startData?.data?.status !== 'SUCCEEDED') return null

    const datasetId = startData.data?.defaultDatasetId
    if (!datasetId) return null
    const itemsRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=100`
    )
    return await itemsRes.json()
  } catch {
    return null
  }
}

// ── TikTok ────────────────────────────────────────────────────────────────────

async function fetchTikTokStats(handle: string) {
  const username = handle.replace('@', '')
  const cutoff = thirtyDaysAgo()

  // Fetch up to 100 videos so we always have enough to cover 30 days
  const data = await runApifyActor(ACTORS.tiktok, {
    profiles: [username],
    resultsPerPage: 100,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
  }) as any[]

  if (!data?.length) return null

  const profile = data[0]

  // Map all returned videos
  const allVideos = data.map((v: any) => ({
    title:    v.text || v.desc || '',
    views:    v.playCount || v.stats?.playCount || 0,
    likes:    v.diggCount || v.stats?.diggCount || 0,
    comments: v.commentCount || v.stats?.commentCount || 0,
    url:      v.webVideoUrl || '',
    thumbnail: v.video?.cover || v.covers?.default || '',
    date:     v.createTime ? new Date(v.createTime * 1000).toISOString() : '',
  }))

  // Filter to last 30 days with date validation
  const recent = allVideos.filter(v => isWithin30Days(v.date, cutoff))

  const views_30d    = recent.reduce((s, v) => s + v.views, 0)
  const likes_30d    = recent.reduce((s, v) => s + v.likes, 0)
  const comments_30d = recent.reduce((s, v) => s + v.comments, 0)

  return {
    followers:     profile.authorMeta?.fans || profile.fans || 0,
    total_views:   views_30d,
    total_likes:   likes_30d,
    avg_views:     recent.length > 0 ? Math.round(views_30d / recent.length) : 0,
    post_count:    recent.length,
    latest_videos: allVideos.slice(0, 50),   // store up to 50 for the expanded view
    // store 30d aggregates as extra fields in the JSON via latest_videos metadata
    // (surfaced in the UI directly from total_views/total_likes + client-side comments sum)
    comments_30d,
  }
}

// ── Instagram ─────────────────────────────────────────────────────────────────

async function fetchInstagramStats(handle: string) {
  const username = handle.replace('@', '')
  const cutoff = thirtyDaysAgo()

  const data = await runApifyActor(ACTORS.instagram, {
    usernames: [username],
  }) as any[]

  if (!data?.length) return null

  const profile = data[0]
  const allPosts = (profile.latestPosts || profile.posts || []).map((p: any) => ({
    title:    p.caption?.slice(0, 100) || '',
    views:    p.videoViewCount || p.videoPlayCount || 0,
    likes:    p.likesCount || p.likes || 0,
    comments: p.commentsCount || p.comments || 0,
    url:      p.url || (p.shortCode ? `https://instagram.com/p/${p.shortCode}` : ''),
    thumbnail: p.displayUrl || p.thumbnailUrl || '',
    date:     p.timestamp || p.takenAt || '',
  }))

  const recent = allPosts.filter((p: any) => isWithin30Days(p.date, cutoff))

  const views_30d    = recent.reduce((s: number, p: any) => s + p.views, 0)
  const likes_30d    = recent.reduce((s: number, p: any) => s + p.likes, 0)
  const comments_30d = recent.reduce((s: number, p: any) => s + p.comments, 0)

  return {
    followers:     profile.followersCount || profile.followers || 0,
    total_views:   views_30d,
    total_likes:   likes_30d,
    avg_views:     recent.length > 0 ? Math.round(views_30d / recent.length) : 0,
    post_count:    recent.length,
    latest_videos: allPosts.slice(0, 50),
    comments_30d,
  }
}

// ── YouTube ───────────────────────────────────────────────────────────────────

async function fetchYouTubeStats(handle: string) {
  try {
    const cutoff = thirtyDaysAgo()
    const publishedAfter = cutoff.toISOString()

    // Resolve channel ID
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(handle)}&type=channel&maxResults=1&key=${YOUTUBE_KEY}`
    )
    const searchData = await searchRes.json() as { items?: { id?: { channelId?: string } }[] }
    const channelId = searchData?.items?.[0]?.id?.channelId
    if (!channelId) return null

    // Fetch channel-level stats + videos from last 30 days (up to 50)
    const [channelRes, videosRes] = await Promise.all([
      fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${YOUTUBE_KEY}`),
      fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&order=date&publishedAfter=${publishedAfter}&maxResults=50&key=${YOUTUBE_KEY}`),
    ])

    const channelData = await channelRes.json() as {
      items?: { statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string } }[]
    }
    const videosData = await videosRes.json() as {
      items?: { id?: { videoId?: string } }[]
    }

    const channelStats = channelData?.items?.[0]?.statistics
    const videoItems   = videosData?.items ?? []

    // Batch-fetch video stats (up to 50 IDs)
    const videoIds = videoItems.map((v: any) => v.id?.videoId).filter(Boolean).join(',')
    let videos: any[] = []

    if (videoIds) {
      const statsRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds}&key=${YOUTUBE_KEY}`
      )
      const statsData = await statsRes.json() as { items?: any[] }
      videos = (statsData?.items ?? []).map((v: any) => ({
        title:    v.snippet?.title || '',
        views:    parseInt(v.statistics?.viewCount    || '0'),
        likes:    parseInt(v.statistics?.likeCount    || '0'),
        comments: parseInt(v.statistics?.commentCount || '0'),
        url:      `https://youtube.com/watch?v=${v.id}`,
        thumbnail: v.snippet?.thumbnails?.medium?.url || '',
        date:     v.snippet?.publishedAt || '',
      }))
    }

    // All returned videos are already within 30 days (publishedAfter filter)
    const views_30d    = videos.reduce((s, v) => s + v.views, 0)
    const likes_30d    = videos.reduce((s, v) => s + v.likes, 0)
    const comments_30d = videos.reduce((s, v) => s + v.comments, 0)

    return {
      followers:     parseInt(channelStats?.subscriberCount || '0'),
      total_views:   views_30d,
      total_likes:   likes_30d,
      avg_views:     videos.length > 0 ? Math.round(views_30d / videos.length) : 0,
      post_count:    videos.length,
      latest_videos: videos,
      comments_30d,
    }
  } catch {
    return null
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { client_id, platform } = await req.json()

  if (!client_id || !platform) {
    return NextResponse.json({ error: 'client_id and platform required' }, { status: 400 })
  }

  const { data: account } = await supabase
    .from('social_accounts')
    .select('handle')
    .eq('client_id', client_id)
    .eq('platform', platform)
    .single()

  if (!account?.handle) {
    return NextResponse.json({ error: 'No handle configured' }, { status: 404 })
  }

  let stats: any = null
  if (platform === 'tiktok')    stats = await fetchTikTokStats(account.handle)
  if (platform === 'instagram') stats = await fetchInstagramStats(account.handle)
  if (platform === 'youtube')   stats = await fetchYouTubeStats(account.handle)

  if (!stats) {
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('social_stats') as any).upsert({
    client_id,
    platform,
    followers:     stats.followers,
    total_views:   stats.total_views,
    total_likes:   stats.total_likes,
    avg_views:     stats.avg_views,
    post_count:    stats.post_count,
    latest_videos: stats.latest_videos,
    refreshed_at:  new Date().toISOString(),
  }, { onConflict: 'client_id,platform' })

  return NextResponse.json({ success: true, stats })
}
