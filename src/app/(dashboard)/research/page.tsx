'use client'

import { useEffect, useState, useRef } from 'react'
import { Search, RefreshCw, Plus, ArrowRight, ExternalLink, Eye, TrendingUp, X, Zap, Play } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import type { Client } from '@/types/database'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TrendVideo {
  handle: string
  label: string
  platform: 'tiktok' | 'youtube' | 'youtube_shorts' | 'instagram'
  title: string
  views: number
  likes: number
  comments: number
  url: string
  thumbnail: string
  date: string
  downloadUrl?: string
}

interface Analysis {
  verdict: 'strong' | 'average' | 'weak'
  score: number
  hook: string
  structure: string
  cta: string
  why_it_worked: string[]
  what_to_steal: string
  watch_out: string
}

type Platform = 'youtube' | 'tiktok' | 'instagram'

// ─── Constants ────────────────────────────────────────────────────────────────

const QUICK_CHIPS: { handle: string; platform: Platform; label: string }[] = [
  { handle: '@milesperhr',      platform: 'tiktok',    label: 'Miles Per Hr' },
  { handle: '@omardrives',      platform: 'tiktok',    label: 'Omar Drives' },
  { handle: '@carthrottle',     platform: 'tiktok',    label: 'Car Throttle' },
  { handle: '@carscouted',      platform: 'tiktok',    label: 'Car Scouted' },
  { handle: '@carwow',          platform: 'youtube',   label: 'Carwow' },
  { handle: '@donutmedia',      platform: 'youtube',   label: 'Donut Media' },
  { handle: '@motortrend',      platform: 'youtube',   label: 'MotorTrend' },
  { handle: '@supercarblondie', platform: 'instagram', label: 'Supercar Blondie' },
  { handle: '@throtl',          platform: 'instagram', label: 'Throtl' },
]

const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: '▶ YT Shorts',
  tiktok: '🎵 TikTok',
  instagram: '📸 Reels',
}

const PLATFORM_COLORS: Record<Platform, string> = {
  youtube: '#ef4444',
  tiktok: '#e8e8e8',
  instagram: '#a855f7',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function platformBadge(p: TrendVideo['platform']) {
  if (p === 'tiktok') return '🎵 TikTok'
  if (p === 'youtube_shorts') return '▶ YT Shorts'
  if (p === 'instagram') return '📸 Instagram'
  return '▶ YouTube'
}

function platformColor(p: TrendVideo['platform']) {
  if (p === 'tiktok') return '#e8e8e8'
  if (p === 'youtube_shorts') return '#ef4444'
  if (p === 'instagram') return '#a855f7'
  return '#ef4444'
}

function formatNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function verdictColor(v?: string) {
  if (v === 'strong') return '#22c55e'
  if (v === 'weak') return '#ef4444'
  return '#f59e0b'
}

function getYouTubeId(url: string) {
  const m1 = url.match(/youtube\.com\/shorts\/([^?&/]+)/)
  const m2 = url.match(/[?&]v=([^&]+)/)
  return m1?.[1] || m2?.[1] || null
}

function getTikTokId(url: string) {
  const m = url.match(/video\/(\d+)/)
  return m?.[1] || null
}

// ─── Video Player ─────────────────────────────────────────────────────────────

function VideoPlayer({ video }: { video: TrendVideo }) {
  const [playing, setPlaying] = useState(false)

  if (video.platform === 'youtube_shorts' || video.platform === 'youtube') {
    const ytId = getYouTubeId(video.url)
    if (!ytId) return <ThumbnailFallback video={video} />
    if (playing) {
      return (
        <div className="w-full bg-black" style={{ aspectRatio: '9/16' }}>
          <iframe
            src={`https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`}
            className="w-full h-full"
            allow="autoplay; fullscreen"
            allowFullScreen
          />
        </div>
      )
    }
    return (
      <div className="relative cursor-pointer group" style={{ aspectRatio: '9/16' }} onClick={() => setPlaying(true)}>
        <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/50 transition-colors">
          <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
            <Play size={24} className="text-white ml-1" />
          </div>
        </div>
      </div>
    )
  }

  if (video.platform === 'tiktok') {
    const ttId = getTikTokId(video.url)
    if (ttId && playing) {
      return (
        <div className="w-full bg-black" style={{ aspectRatio: '9/16' }}>
          <iframe
            src={`https://www.tiktok.com/embed/v2/${ttId}`}
            className="w-full h-full"
            allow="autoplay; fullscreen"
            allowFullScreen
          />
        </div>
      )
    }
    return (
      <div className="relative cursor-pointer group" style={{ aspectRatio: '9/16' }} onClick={() => setPlaying(true)}>
        {video.thumbnail
          ? <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-[#1a1a1a] flex items-center justify-center"><span className="text-4xl">🎵</span></div>
        }
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/50 transition-colors">
          <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
            <Play size={24} className="text-white ml-1" />
          </div>
        </div>
        <div className="absolute bottom-2 left-2 right-2 text-center">
          <span className="text-[10px] text-white/70 bg-black/50 px-2 py-0.5 rounded-full">Click to load TikTok player</span>
        </div>
      </div>
    )
  }

  // Instagram — can't embed, show thumbnail + open button
  return <ThumbnailFallback video={video} />
}

function ThumbnailFallback({ video }: { video: TrendVideo }) {
  return (
    <div className="relative" style={{ aspectRatio: '9/16' }}>
      {video.thumbnail
        ? <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
        : <div className="w-full h-full bg-[#1a1a1a] flex items-center justify-center"><span className="text-4xl">📸</span></div>
      }
      <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-3 p-4">
        <p className="text-xs text-white/80 text-center">Instagram doesn't allow embedding</p>
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-[#a855f7] rounded-full text-xs font-medium text-white hover:bg-[#9333ea] transition-colors"
        >
          <ExternalLink size={12} /> Open on Instagram
        </a>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ResearchPage() {
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)

  // Search / trends
  const [query, setQuery] = useState('')
  const [platforms, setPlatforms] = useState<Platform[]>(['youtube', 'tiktok', 'instagram'])
  const [searchResults, setSearchResults] = useState<TrendVideo[]>([])
  const [trendResults, setTrendResults] = useState<TrendVideo[]>([])
  const [mode, setMode] = useState<'trends' | 'search'>('trends')
  const [loading, setLoading] = useState(false)
  const [lastFetched, setLastFetched] = useState<string | null>(null)

  // Ideas
  const [ideas, setIdeas] = useState<string[]>([])

  // Selected video (sidebar player)
  const [selectedVideo, setSelectedVideo] = useState<TrendVideo | null>(null)

  // Analysis
  const [analyzeLoading, setAnalyzeLoading] = useState(false)
  const [analyzeError, setAnalyzeError] = useState(false)
  const [activeAnalysis, setActiveAnalysis] = useState<Analysis | null>(null)
  const [activeTranscript, setActiveTranscript] = useState<string | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [clients, setClients] = useState<Client[]>([])

  useEffect(() => {
    const saved = localStorage.getItem('matoh_research_ideas')
    if (saved) setIdeas(JSON.parse(saved))
    const savedTrends = localStorage.getItem('matoh_research_trends')
    const savedTime = localStorage.getItem('matoh_research_time')
    if (savedTrends) { setTrendResults(JSON.parse(savedTrends)); setLastFetched(savedTime) }
    supabase.from('clients').select('*').eq('status', 'active').order('name').then(({ data }) => setClients(data ?? []))
  }, [])

  // ── Fetch trends ──────────────────────────────────────────────────────────

  async function fetchTrends() {
    setLoading(true)
    setMode('trends')
    try {
      const res = await fetch('/api/research/trends')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json() as TrendVideo[]
      setTrendResults(data)
      const now = new Date().toISOString()
      setLastFetched(now)
      localStorage.setItem('matoh_research_trends', JSON.stringify(data))
      localStorage.setItem('matoh_research_time', now)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  // ── Search ────────────────────────────────────────────────────────────────

  async function runSearch(q?: string, overridePlatforms?: Platform[]) {
    const sq = (q ?? query).trim()
    if (!sq) return
    setLoading(true)
    setMode('search')
    try {
      const ps = overridePlatforms ?? platforms
      const params = new URLSearchParams({ q: sq, platforms: ps.join(',') })
      const res = await fetch(`/api/research/search?${params}`)
      if (!res.ok) throw new Error('Failed')
      setSearchResults(await res.json() as TrendVideo[])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  function chipSearch(handle: string, platform: Platform) {
    setQuery(handle)
    const ps: Platform[] = platform === 'youtube' ? ['youtube'] : [platform]
    setPlatforms(ps)
    runSearch(handle, ps)
  }

  function clearSearch() {
    setQuery('')
    setMode('trends')
    setSearchResults([])
    inputRef.current?.focus()
  }

  function togglePlatform(p: Platform) {
    setPlatforms(prev =>
      prev.includes(p) ? (prev.length > 1 ? prev.filter(x => x !== p) : prev) : [...prev, p]
    )
  }

  // ── Select video (opens sidebar player) ──────────────────────────────────

  function selectVideo(video: TrendVideo) {
    setSelectedVideo(video)
    setActiveAnalysis(null)
    setActiveTranscript(null)
    setAnalyzeError(false)
    setAnalyzeLoading(false)
  }

  function closeSidebar() {
    setSelectedVideo(null)
    setActiveAnalysis(null)
    setAnalyzeLoading(false)
    setAnalyzeError(false)
  }

  // ── Analyze ───────────────────────────────────────────────────────────────

  async function analyzeVideo(video: TrendVideo) {
    setAnalyzeLoading(true)
    setAnalyzeError(false)
    setActiveAnalysis(null)
    try {
      const videoId = getYouTubeId(video.url) ?? undefined
      const res = await fetch('/api/research/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: video.platform,
          videoId,
          downloadUrl: video.downloadUrl,
          title: video.title,
          views: video.views,
          likes: video.likes,
          comments: video.comments,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setAnalyzeError(true); return }
      setActiveAnalysis(data.analysis as Analysis)
      setActiveTranscript(data.transcript ?? null)
    } catch (e) {
      console.error(e)
      setAnalyzeError(true)
    } finally {
      setAnalyzeLoading(false)
    }
  }

  // ── Ideas ─────────────────────────────────────────────────────────────────

  function addToIdeas(video: TrendVideo) {
    const idea = `[${video.label}] ${video.title}`
    if (ideas.includes(idea)) return
    const next = [idea, ...ideas]
    setIdeas(next)
    localStorage.setItem('matoh_research_ideas', JSON.stringify(next))
  }

  function removeIdea(idx: number) {
    const next = ideas.filter((_, i) => i !== idx)
    setIdeas(next)
    localStorage.setItem('matoh_research_ideas', JSON.stringify(next))
  }

  async function addToContentPipeline(idea: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('content_items') as any).insert({
      title: idea, filming_status: 'not_filmed', edit_status: 'unassigned', approval_status: 'pending',
    })
    alert('Added to Content Board!')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const displayVideos = mode === 'search' ? searchResults : trendResults

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-6 py-4 border-b border-[#2e2e2e] flex-shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#e8e8e8]">Content Research</h1>
            <p className="text-xs text-[#888] mt-0.5">
              {mode === 'search'
                ? `${searchResults.length} results for "${query}"`
                : `Top short-form content from competitor accounts${lastFetched ? ` · ${new Date(lastFetched).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}`}
            </p>
          </div>
          <Button onClick={fetchTrends} disabled={loading} variant="ghost">
            <RefreshCw size={13} className={loading && mode === 'trends' ? 'animate-spin' : ''} />
            Refresh Trends
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch()}
              placeholder="Search keywords, #hashtags, or @accounts…"
              className="w-full pl-9 pr-8 py-2.5 bg-[#191919] border border-[#2e2e2e] rounded-card text-sm text-[#e8e8e8] placeholder-[#555] focus:outline-none focus:border-[#4f8ef7]"
            />
            {query && (
              <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#888]">
                <X size={13} />
              </button>
            )}
          </div>
          {(['youtube', 'tiktok', 'instagram'] as Platform[]).map(p => (
            <button
              key={p}
              onClick={() => togglePlatform(p)}
              className={`px-3 py-2 rounded-card text-xs font-medium border transition-colors ${platforms.includes(p) ? 'border-[#3a3a3a] bg-[#252525]' : 'border-[#2e2e2e] bg-transparent text-[#555] hover:text-[#888]'}`}
              style={platforms.includes(p) ? { color: PLATFORM_COLORS[p] } : {}}
            >
              {PLATFORM_LABELS[p]}
            </button>
          ))}
          <Button onClick={() => runSearch()} disabled={!query.trim() || loading}>
            {loading && mode === 'search' ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
            Search
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-[#555] uppercase tracking-wide">Quick:</span>
          {QUICK_CHIPS.map(c => (
            <button
              key={`${c.handle}-${c.platform}`}
              onClick={() => chipSearch(c.handle, c.platform)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-[#191919] border border-[#2e2e2e] rounded-full text-xs text-[#888] hover:text-[#e8e8e8] hover:border-[#3a3a3a] transition-colors"
            >
              <span style={{ color: PLATFORM_COLORS[c.platform], fontSize: 10 }}>
                {c.platform === 'youtube' ? '▶' : c.platform === 'tiktok' ? '🎵' : '📸'}
              </span>
              {c.handle}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex">

        {/* Video grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <RefreshCw size={28} className="animate-spin text-[#4f8ef7]" />
              <p className="text-sm text-[#888]">{mode === 'search' ? `Searching for "${query}"…` : 'Fetching trending videos…'}</p>
            </div>
          ) : displayVideos.length === 0 ? (
            <div className="text-center py-20">
              <TrendingUp size={40} className="mx-auto mb-3 text-[#555]" />
              {mode === 'search' ? (
                <p className="text-[#888] text-sm">No results for "{query}"</p>
              ) : (
                <>
                  <p className="text-[#888] text-sm mb-4">Hit "Refresh Trends" to load competitor videos.</p>
                  <Button onClick={fetchTrends}>Load Competitor Trends</Button>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayVideos.map((video, i) => (
                <div
                  key={i}
                  className={`bg-[#202020] border rounded-card overflow-hidden transition-colors ${selectedVideo === video ? 'border-[#a78bfa]' : 'border-[#2e2e2e] hover:border-[#3a3a3a]'}`}
                >
                  {/* Thumbnail — click to open player in sidebar */}
                  <div
                    className="relative cursor-pointer group"
                    onClick={() => selectVideo(video)}
                  >
                    {video.thumbnail ? (
                      <img src={video.thumbnail} alt={video.title} className="w-full h-40 object-cover" />
                    ) : (
                      <div className="w-full h-40 bg-[#2a2a2a] flex items-center justify-center">
                        <span className="text-3xl">{video.platform === 'tiktok' ? '🎵' : video.platform === 'instagram' ? '📸' : '▶'}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                        <Play size={20} className="text-white ml-0.5" />
                      </div>
                    </div>
                    <div className="absolute top-2 left-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: 'rgba(0,0,0,0.7)', color: platformColor(video.platform) }}>
                        {platformBadge(video.platform)}
                      </span>
                    </div>
                  </div>

                  <div className="p-3">
                    <p className="text-[11px] text-[#555] mb-1">{video.label || video.handle}</p>
                    <p className="text-sm font-medium text-[#e8e8e8] line-clamp-2 mb-2 leading-snug">{video.title || '(no caption)'}</p>
                    <div className="flex items-center gap-3 text-xs text-[#888] mb-3">
                      <span className="flex items-center gap-1"><Eye size={11} /> {formatNum(video.views)}</span>
                      <span>♥ {formatNum(video.likes)}</span>
                      <span>💬 {formatNum(video.comments)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => addToIdeas(video)} className="flex items-center gap-1 text-xs text-[#4f8ef7] hover:text-[#3a7de8] transition-colors">
                        <Plus size={11} /> Save idea
                      </button>
                      <button
                        onClick={() => { selectVideo(video); setTimeout(() => analyzeVideo(video), 50) }}
                        className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded bg-[#2a1f3d] text-[#c4b5fd] hover:bg-[#3d2d5c] transition-colors"
                      >
                        <Zap size={11} /> Analyze
                      </button>
                      <a href={video.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-[#888] hover:text-[#e8e8e8] transition-colors ml-auto">
                        <ExternalLink size={11} /> View
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="w-80 border-l border-[#2e2e2e] flex flex-col flex-shrink-0">
          {selectedVideo ? (
            <>
              {/* Video player */}
              <div className="flex-shrink-0 border-b border-[#2e2e2e]">
                <div className="flex items-center justify-between px-3 py-2">
                  <p className="text-xs text-[#888] truncate flex-1">{selectedVideo.label}</p>
                  <button onClick={closeSidebar} className="text-[#555] hover:text-[#e8e8e8] transition-colors ml-2">
                    <X size={14} />
                  </button>
                </div>
                <VideoPlayer video={selectedVideo} />
                <div className="p-3 space-y-1">
                  <p className="text-xs font-medium text-[#e8e8e8] line-clamp-2 leading-snug">{selectedVideo.title || '(no caption)'}</p>
                  <div className="flex items-center gap-3 text-xs text-[#888]">
                    <span className="flex items-center gap-1"><Eye size={10} /> {formatNum(selectedVideo.views)}</span>
                    <span>♥ {formatNum(selectedVideo.likes)}</span>
                    <span>💬 {formatNum(selectedVideo.comments)}</span>
                  </div>
                </div>
                <div className="px-3 pb-3">
                  <button
                    onClick={() => analyzeVideo(selectedVideo)}
                    disabled={analyzeLoading}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-[#2a1f3d] text-[#c4b5fd] hover:bg-[#3d2d5c] disabled:opacity-50 transition-colors text-sm font-medium"
                  >
                    {analyzeLoading ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
                    {analyzeLoading ? 'Analyzing with Claude…' : activeAnalysis ? 'Re-analyze' : 'Analyze this video'}
                  </button>
                </div>
              </div>

              {/* Analysis results */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {analyzeLoading && (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <RefreshCw size={20} className="animate-spin text-[#a78bfa]" />
                    <p className="text-xs text-[#888]">~10 seconds…</p>
                  </div>
                )}

                {analyzeError && !analyzeLoading && (
                  <div className="text-center py-6">
                    <p className="text-sm text-[#ef4444] mb-2">Analysis failed</p>
                    <button onClick={() => analyzeVideo(selectedVideo)} className="text-xs text-[#4f8ef7] hover:underline">Try again</button>
                  </div>
                )}

                {activeAnalysis && !analyzeLoading && (
                  <>
                    <div className="flex items-center gap-3 pb-3 border-b border-[#2e2e2e]">
                      <div className="text-4xl font-bold" style={{ color: verdictColor(activeAnalysis.verdict) }}>{activeAnalysis.score}</div>
                      <div>
                        <p className="text-[10px] text-[#888] uppercase tracking-wide">Score / 10</p>
                        <p className="text-sm font-semibold capitalize" style={{ color: verdictColor(activeAnalysis.verdict) }}>{activeAnalysis.verdict}</p>
                      </div>
                    </div>
                    {activeAnalysis.hook && <div><p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">🪝 Hook</p><p className="text-xs text-[#e8e8e8] leading-relaxed">{activeAnalysis.hook}</p></div>}
                    {activeAnalysis.structure && <div><p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">📐 Structure</p><p className="text-xs text-[#e8e8e8] leading-relaxed">{activeAnalysis.structure}</p></div>}
                    {activeAnalysis.cta && <div><p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">📣 CTA</p><p className="text-xs text-[#e8e8e8] leading-relaxed">{activeAnalysis.cta}</p></div>}
                    {activeAnalysis.why_it_worked?.length > 0 && (
                      <div>
                        <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">✅ Why it worked</p>
                        <ul className="space-y-1.5">
                          {activeAnalysis.why_it_worked.map((pt, j) => (
                            <li key={j} className="text-xs text-[#e8e8e8] flex gap-1.5"><span className="text-[#555] flex-shrink-0">•</span>{pt}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {activeAnalysis.what_to_steal && (
                      <div>
                        <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">💡 What to steal</p>
                        <div className="bg-[#1a2040] border border-[#4f8ef7]/20 rounded-lg p-2.5">
                          <p className="text-xs text-[#e8e8e8] leading-relaxed">{activeAnalysis.what_to_steal}</p>
                        </div>
                      </div>
                    )}
                    {activeAnalysis.watch_out && <div><p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">⚠️ Watch out</p><p className="text-xs text-[#e8e8e8] leading-relaxed">{activeAnalysis.watch_out}</p></div>}
                    {activeTranscript && (
                      <details>
                        <summary className="text-[10px] text-[#555] hover:text-[#888] cursor-pointer select-none">View Transcript</summary>
                        <div className="mt-2 max-h-32 overflow-y-auto bg-[#191919] border border-[#2e2e2e] rounded-lg p-2">
                          <p className="text-[10px] text-[#888] leading-relaxed whitespace-pre-wrap">{activeTranscript}</p>
                        </div>
                      </details>
                    )}
                    <div className="pt-2 border-t border-[#2e2e2e]">
                      <button onClick={() => { addToIdeas(selectedVideo); closeSidebar() }} className="flex items-center gap-1.5 text-xs text-[#4f8ef7] hover:text-[#3a7de8] transition-colors">
                        <Plus size={11} /> Save to Ideas
                      </button>
                    </div>
                  </>
                )}

                {!analyzeLoading && !analyzeError && !activeAnalysis && (
                  <p className="text-xs text-[#555] text-center pt-4">Click "Analyze this video" to get a breakdown</p>
                )}
              </div>
            </>
          ) : (
            /* Saved Ideas */
            <>
              <div className="p-4 border-b border-[#2e2e2e] flex-shrink-0">
                <h2 className="text-sm font-semibold text-[#e8e8e8]">Saved Ideas</h2>
                <p className="text-xs text-[#888] mt-0.5">{ideas.length} saved · click to push to Content Board</p>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {ideas.length === 0 ? (
                  <p className="text-xs text-[#555] text-center pt-8">Hit "Save idea" on any video to collect it here.</p>
                ) : ideas.map((idea, i) => (
                  <div key={i} className="bg-[#202020] border border-[#2e2e2e] rounded-card p-3 hover:border-[#3a3a3a] transition-colors">
                    <p className="text-xs text-[#e8e8e8] leading-snug mb-2">{idea}</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => addToContentPipeline(idea)} className="flex items-center gap-1 text-[10px] text-[#4f8ef7] hover:text-[#3a7de8] transition-colors">
                        <ArrowRight size={10} /> Add to pipeline
                      </button>
                      <button onClick={() => removeIdea(i)} className="text-[10px] text-[#555] hover:text-[#ef4444] transition-colors ml-auto">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
