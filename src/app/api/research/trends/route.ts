export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'

const YOUTUBE_KEY = process.env.YOUTUBE_API_KEY!
const IG_USER     = process.env.INSTAGRAM_USERNAME!
const IG_PASS     = process.env.INSTAGRAM_PASSWORD!

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

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

// ─── YouTube Shorts ───────────────────────────────────────────────────────────

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
      }))
  } catch { return [] }
}

// ─── TikTok (direct page scrape — no Apify) ──────────────────────────────────

async function fetchTikTokTopVideos(handle: string, label: string) {
  try {
    const res = await fetch(`https://www.tiktok.com/@${handle}`, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
      },
    })
    const html = await res.text()

    // TikTok embeds data in __UNIVERSAL_DATA_FOR_REHYDRATION__ script tag
    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)
    if (!match) {
      // Fallback: try older SIGI_STATE format
      const sigiMatch = html.match(/window\['SIGI_STATE'\]\s*=\s*(\{[\s\S]*?\});\s*window\[/)
      if (!sigiMatch) return []
      const sigiData = JSON.parse(sigiMatch[1])
      const itemModule = sigiData?.ItemModule || {}
      return Object.values(itemModule).slice(0, 5).map((v: any) => ({
        handle, label, platform: 'tiktok' as const,
        title: v.desc || '',
        views: v.stats?.playCount || 0,
        likes: v.stats?.diggCount || 0,
        comments: v.stats?.commentCount || 0,
        url: `https://www.tiktok.com/@${handle}/video/${v.id}`,
        thumbnail: v.video?.cover || '',
        date: v.createTime ? new Date(v.createTime * 1000).toISOString() : '',
      }))
    }

    const data = JSON.parse(match[1])
    const scope = data['__DEFAULT_SCOPE__'] || {}

    // Try different known paths for video list
    const itemList: any[] =
      scope['webapp.video-list']?.itemList ||
      scope['webapp.userPost']?.statusList ||
      scope['webapp.user-post']?.itemList ||
      []

    if (itemList.length === 0) return []

    // Sort by playCount descending, take top 5
    return itemList
      .sort((a: any, b: any) => (b.stats?.playCount || 0) - (a.stats?.playCount || 0))
      .slice(0, 5)
      .map((v: any) => ({
        handle, label, platform: 'tiktok' as const,
        title: v.desc || '',
        views: v.stats?.playCount || 0,
        likes: v.stats?.diggCount || 0,
        comments: v.stats?.commentCount || 0,
        url: `https://www.tiktok.com/@${handle}/video/${v.id}`,
        thumbnail: v.video?.cover || v.video?.originCover || '',
        date: v.createTime ? new Date(v.createTime * 1000).toISOString() : '',
      }))
  } catch { return [] }
}

// ─── Instagram (session-based — no Apify) ────────────────────────────────────

// Module-level session cache (lives for the duration of the serverless instance)
let _igSession: string | null = null
let _igSessionTs = 0

async function getInstagramSession(): Promise<string | null> {
  // Re-use cached session for up to 55 minutes
  if (_igSession && Date.now() - _igSessionTs < 55 * 60 * 1000) return _igSession

  if (!IG_USER || !IG_PASS) return null

  try {
    // Step 1: get CSRF token from homepage
    const initRes = await fetch('https://www.instagram.com/', {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    })
    const initCookies = initRes.headers.get('set-cookie') || ''
    const csrfMatch = initCookies.match(/csrftoken=([^;,\s]+)/)
    if (!csrfMatch) return null
    const csrf = csrfMatch[1]

    // Step 2: login
    const encPassword = `#PWD_INSTAGRAM_BROWSER:0:${Math.floor(Date.now() / 1000)}:${IG_PASS}`
    const loginRes = await fetch('https://www.instagram.com/accounts/login/ajax/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': UA,
        'X-CSRFToken': csrf,
        'X-Instagram-AJAX': '1',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://www.instagram.com/',
        'Cookie': `csrftoken=${csrf}; ig_did=${randomHex(16)}`,
      },
      body: new URLSearchParams({
        username: IG_USER,
        enc_password: encPassword,
        queryParams: '{}',
        optIntoOneTap: 'false',
        stopDeletionNonce: '',
        trustedDeviceRecords: '{}',
      }).toString(),
    })

    const loginSetCookie = loginRes.headers.get('set-cookie') || ''
    const sessionMatch = loginSetCookie.match(/sessionid=([^;,\s]+)/)
    if (sessionMatch) {
      _igSession = sessionMatch[1]
      _igSessionTs = Date.now()
      return _igSession
    }

    // Log reason if not authenticated
    try {
      const body = await loginRes.text()
      console.warn('[IG login failed]', loginRes.status, body.slice(0, 300))
    } catch { /* ignore */ }
    return null
  } catch (e) {
    console.warn('[IG session error]', e)
    return null
  }
}

function randomHex(len: number) {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

async function fetchInstagramReels(handle: string, label: string) {
  try {
    const sessionId = await getInstagramSession()
    if (!sessionId) return []

    const igHeaders: Record<string, string> = {
      'User-Agent': UA,
      'Cookie': `sessionid=${sessionId}`,
      'X-IG-App-ID': '936619743392459',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': `https://www.instagram.com/${handle}/`,
    }

    // Step 1: get numeric user ID from profile
    const profileRes = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${handle}`,
      { headers: igHeaders }
    )
    const profileData = await profileRes.json() as any
    const userId: string = profileData?.data?.user?.id
    if (!userId) return []

    // Step 2: fetch reels
    const reelsRes = await fetch('https://www.instagram.com/api/v1/clips/user/', {
      method: 'POST',
      headers: {
        ...igHeaders,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        target_user_id: userId,
        page_size: '12',
        max_id: '',
        include_feed_video: 'true',
      }).toString(),
    })
    const reelsData = await reelsRes.json() as any
    const items: any[] = reelsData?.items || []

    return items
      .sort((a: any, b: any) => (b.media?.play_count || 0) - (a.media?.play_count || 0))
      .slice(0, 5)
      .map((item: any) => {
        const v = item.media || item
        return {
          handle, label, platform: 'instagram' as const,
          title: v.caption?.text || '',
          views: v.play_count || v.view_count || v.like_count || 0,
          likes: v.like_count || 0,
          comments: v.comment_count || 0,
          url: `https://www.instagram.com/p/${v.code || v.shortcode}/`,
          thumbnail: v.image_versions2?.candidates?.[0]?.url || v.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url || '',
          date: v.taken_at ? new Date(v.taken_at * 1000).toISOString() : '',
        }
      })
  } catch (e) {
    console.warn(`[IG reels error] @${handle}:`, e)
    return []
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET() {
  const results = await Promise.all([
    ...YOUTUBE_COMPETITORS.map(c => fetchYouTubeShorts(c.handle, c.label)),
    ...TIKTOK_COMPETITORS.map(c => fetchTikTokTopVideos(c.handle, c.label)),
    ...INSTAGRAM_COMPETITORS.map(c => fetchInstagramReels(c.handle, c.label)),
  ])

  const all = results.flat().sort((a, b) => b.views - a.views)
  return NextResponse.json(all)
}
