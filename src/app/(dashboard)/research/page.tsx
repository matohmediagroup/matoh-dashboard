'use client'

import { useEffect, useState, useRef } from 'react'
import { Search, RefreshCw, Plus, ArrowRight, ExternalLink, Eye, TrendingUp, X, Zap, Sparkles } from 'lucide-react'
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
  body: string
  cta: string
  why_it_worked: string[]
  what_to_steal: string
  watch_out: string
}

type Platform = 'youtube' | 'tiktok' | 'instagram'

// ─── Constants ───────────────────────────────────────────────────────────────

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

const PLATFORM_META = {
  youtube_shorts: { label: 'YouTube Shorts', color: '#ef4444', bg: '#ef444418', icon: '▶' },
  youtube:        { label: 'YouTube',         color: '#ef4444', bg: '#ef444418', icon: '▶' },
  tiktok:         { label: 'TikTok',          color: '#a0a0a0', bg: '#ffffff10', icon: '♪' },
  instagram:      { label: 'Instagram',       color: '#a855f7', bg: '#a855f718', icon: '◈' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function engagementRate(v: TrendVideo) {
  if (!v.views) return '0%'
  return `${(((v.likes + v.comments) / v.views) * 100).toFixed(1)}%`
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

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ResearchPage() {
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [platforms, setPlatforms] = useState<Platform[]>(['youtube', 'tiktok', 'instagram'])
  const [searchResults, setSearchResults] = useState<TrendVideo[]>([])
  const [trendResults, setTrendResults] = useState<TrendVideo[]>([])
  const [mode, setMode] = useState<'trends' | 'search'>('trends')
  const [loading, setLoading] = useState(false)
  const [lastFetched, setLastFetched] = useState<string | null>(null)
  const [ideas, setIdeas] = useState<string[]>([])
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [clients, setClients] = useState<Client[]>([])

  // Per-video analysis
  const [analyses, setAnalyses] = useState<Record<number, Analysis>>({})
  const [analyzing, setAnalyzing] = useState<number | null>(null)

  // Sidebar
  const [sidebarVideo, setSidebarVideo] = useState<{ video: TrendVideo; index: number } | null>(null)

  // Batch AI insights
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insights, setInsights] = useState<string | null>(null)

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
    setLoading(true); setMode('trends')
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

  async function runSearch(q?: string, ps?: Platform[]) {
    const sq = (q ?? query).trim()
    if (!sq) return
    setLoading(true); setMode('search')
    try {
      const activePlatforms = ps ?? platforms
      const params = new URLSearchParams({ q: sq, platforms: activePlatforms.join(',') })
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

  function togglePlatform(p: Platform) {
    setPlatforms(prev => prev.includes(p) ? (prev.length > 1 ? prev.filter(x => x !== p) : prev) : [...prev, p])
  }

  // ── Analyze single video ──────────────────────────────────────────────────

  async function analyzeVideo(video: TrendVideo, index: number) {
    setAnalyzing(index)
    setSidebarVideo({ video, index })
    try {
      const videoId = getYouTubeId(video.url) ?? undefined
      const res = await fetch('/api/research/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: video.platform, videoId, downloadUrl: video.downloadUrl, title: video.title, views: video.views, likes: video.likes, comments: video.comments }),
      })
      const data = await res.json()
      if (res.ok && !data.error) setAnalyses(prev => ({ ...prev, [index]: data.analysis }))
    } catch (e) { console.error(e) }
    finally { setAnalyzing(null) }
  }

  // ── AI Insights (batch) ───────────────────────────────────────────────────

  async function generateInsights() {
    const videos = displayVideos.slice(0, 12)
    if (!videos.length) return
    setInsightsLoading(true)
    setInsights(null)
    setSidebarVideo(null)
    try {
      const summary = videos.map((v, i) =>
        `${i + 1}. [${v.platform}] "${v.title}" — ${formatNum(v.views)} views, ${formatNum(v.likes)} likes (${engagementRate(v)} eng) — @${v.label}`
      ).join('\n')

      const res = await fetch('/api/research/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'batch',
          title: `BATCH ANALYSIS of top ${videos.length} trending videos:\n\n${summary}`,
          views: 0, likes: 0, comments: 0,
          batchMode: true,
        }),
      })
      const data = await res.json()
      if (res.ok && data.analysis) {
        // Format the batch insights as readable text
        const a = data.analysis
        const text = [
          a.hook && `**Winning Hook Patterns:**\n${a.hook}`,
          a.structure && `**What Structures Are Working:**\n${a.structure}`,
          a.why_it_worked?.length && `**Why These Videos Are Performing:**\n${a.why_it_worked.map((p: string) => `• ${p}`).join('\n')}`,
          a.what_to_steal && `**What To Steal For Dealership Content:**\n${a.what_to_steal}`,
          a.watch_out && `**Watch Out For:**\n${a.watch_out}`,
        ].filter(Boolean).join('\n\n')
        setInsights(text)
      }
    } catch (e) { console.error(e) }
    finally { setInsightsLoading(false) }
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
    await (supabase.from('content_items') as any).insert({ title: idea, filming_status: 'not_filmed', edit_status: 'unassigned', approval_status: 'pending' })
    alert('Added to Content Board!')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const allVideos = mode === 'search' ? searchResults : trendResults
  const displayVideos = allVideos.filter(v => {
    if (v.platform === 'youtube_shorts' || v.platform === 'youtube') return platforms.includes('youtube')
    return platforms.includes(v.platform as Platform)
  })

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-6 pt-5 pb-0 border-b border-[#2e2e2e] flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-[#e8e8e8]">Content Research</h1>
            <p className="text-xs text-[#888] mt-0.5">
              {lastFetched ? `Updated ${new Date(lastFetched).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'Discover what\'s working across platforms'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {displayVideos.length > 0 && (
              <button
                onClick={generateInsights}
                disabled={insightsLoading}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#1a1a2e] border border-[#4f8ef7]/30 rounded-card text-xs font-medium text-[#4f8ef7] hover:bg-[#1e2040] disabled:opacity-50 transition-colors"
              >
                {insightsLoading ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                AI Insights
              </button>
            )}
            <Button onClick={fetchTrends} disabled={loading} variant="ghost">
              <RefreshCw size={13} className={loading && mode === 'trends' ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch()}
              placeholder="Search keywords, #hashtags, or @accounts…"
              className="w-full pl-9 pr-8 py-2.5 bg-[#191919] border border-[#2e2e2e] rounded-card text-sm text-[#e8e8e8] placeholder-[#555] focus:outline-none focus:border-[#4f8ef7]"
            />
            {query && <button onClick={() => { setQuery(''); setMode('trends'); setSearchResults([]) }} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#888]"><X size={13} /></button>}
          </div>
          <Button onClick={() => runSearch()} disabled={!query.trim() || loading}>
            {loading && mode === 'search' ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
            Search
          </Button>
        </div>

        {/* Platform tabs */}
        <div className="flex items-center gap-0 -mb-px">
          {([
            { key: 'youtube' as Platform,   label: 'YouTube Shorts', icon: '▶', color: '#ef4444' },
            { key: 'tiktok' as Platform,    label: 'TikTok',         icon: '♪', color: '#a0a0a0' },
            { key: 'instagram' as Platform, label: 'Instagram',      icon: '◈', color: '#a855f7' },
          ]).map(p => {
            const active = platforms.includes(p.key)
            return (
              <button
                key={p.key}
                onClick={() => togglePlatform(p.key)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-all ${active ? '' : 'border-b-transparent text-[#555] hover:text-[#888]'}`}
                style={active ? { color: p.color, borderBottomColor: p.color } : {}}
              >
                <span>{p.icon}</span>
                {p.label}
              </button>
            )
          })}
          <div className="ml-auto flex items-center gap-1.5 pb-2">
            {QUICK_CHIPS.filter(c => platforms.includes(c.platform)).slice(0, 5).map(c => (
              <button key={`${c.handle}-${c.platform}`} onClick={() => chipSearch(c.handle, c.platform)}
                className="px-2.5 py-1 bg-[#191919] border border-[#2e2e2e] rounded-full text-[11px] text-[#888] hover:text-[#e8e8e8] hover:border-[#3a3a3a] transition-colors">
                {c.handle}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex">

        {/* Main content list */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <RefreshCw size={28} className="animate-spin text-[#4f8ef7]" />
              <p className="text-sm text-[#888]">{mode === 'search' ? `Searching…` : 'Fetching trending content…'}</p>
            </div>
          ) : displayVideos.length === 0 ? (
            <div className="text-center py-20">
              <TrendingUp size={40} className="mx-auto mb-3 text-[#555]" />
              <p className="text-[#888] text-sm mb-4">Hit "Refresh" to load trending competitor content.</p>
              <Button onClick={fetchTrends}>Load Trending Content</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Summary strip */}
              <div className="flex items-center gap-4 mb-4 pb-4 border-b border-[#2e2e2e]">
                <span className="text-sm text-[#888]">{displayVideos.length} videos</span>
                {(['youtube_shorts', 'tiktok', 'instagram'] as const).map(p => {
                  const count = displayVideos.filter(v => v.platform === p).length
                  if (!count) return null
                  const meta = PLATFORM_META[p]
                  return (
                    <span key={p} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full" style={{ background: meta.bg, color: meta.color }}>
                      {meta.icon} {meta.label} · {count}
                    </span>
                  )
                })}
                <span className="ml-auto text-xs text-[#555]">Click ⚡ to analyze any video · Click title to view on platform</span>
              </div>

              {displayVideos.map((video, i) => {
                const meta = PLATFORM_META[video.platform] ?? PLATFORM_META.youtube_shorts
                const analysis = analyses[i]
                const isAnalyzing = analyzing === i
                const er = engagementRate(video)

                return (
                  <div
                    key={i}
                    className={`group flex items-start gap-4 p-4 rounded-card border transition-colors ${
                      sidebarVideo?.index === i ? 'bg-[#1e1e2e] border-[#4f8ef7]/30' : 'bg-[#202020] border-[#2e2e2e] hover:border-[#3a3a3a]'
                    }`}
                  >
                    {/* Platform badge */}
                    <div className="flex-shrink-0 mt-0.5">
                      <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold" style={{ background: meta.bg, color: meta.color }}>
                        {meta.icon}
                      </span>
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-[#555] mb-0.5">{video.label}</p>
                          <a
                            href={video.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-[#e8e8e8] hover:text-[#4f8ef7] transition-colors line-clamp-2 leading-snug block"
                          >
                            {video.title || '(no caption)'}
                          </a>
                        </div>

                        {/* Score badge if analyzed */}
                        {analysis && (
                          <div
                            className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg text-sm font-bold"
                            style={{ background: `${verdictColor(analysis.verdict)}18`, color: verdictColor(analysis.verdict) }}
                          >
                            {analysis.score}
                          </div>
                        )}
                      </div>

                      {/* Metrics */}
                      <div className="flex items-center gap-4 mt-2">
                        <span className="flex items-center gap-1 text-xs text-[#888]"><Eye size={10} /> {formatNum(video.views)}</span>
                        <span className="text-xs text-[#888]">♥ {formatNum(video.likes)}</span>
                        <span className="text-xs text-[#888]">💬 {formatNum(video.comments)}</span>
                        <span className={`text-xs font-medium ${parseFloat(er) > 5 ? 'text-[#22c55e]' : parseFloat(er) > 2 ? 'text-[#f59e0b]' : 'text-[#888]'}`}>
                          {er} eng
                        </span>

                        {/* Actions */}
                        <div className="ml-auto flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => addToIdeas(video)}
                            className="flex items-center gap-1 text-xs text-[#4f8ef7] hover:text-[#3a7de8] transition-colors"
                          >
                            <Plus size={10} /> Save idea
                          </button>
                          <button
                            onClick={() => analyzeVideo(video, i)}
                            disabled={isAnalyzing}
                            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-[#2a1f3d] text-[#c4b5fd] hover:bg-[#3d2d5c] disabled:opacity-50 transition-colors"
                          >
                            {isAnalyzing ? <RefreshCw size={10} className="animate-spin" /> : <Zap size={10} />}
                            {isAnalyzing ? 'Analyzing…' : analysis ? 'Re-analyze' : 'Analyze'}
                          </button>
                          <a href={video.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-[#555] hover:text-[#888] transition-colors">
                            <ExternalLink size={10} /> View
                          </a>
                        </div>
                      </div>

                      {/* Inline analysis preview if analyzed */}
                      {analysis && (
                        <div
                          className="mt-3 p-3 rounded-lg border cursor-pointer"
                          style={{ background: `${verdictColor(analysis.verdict)}08`, borderColor: `${verdictColor(analysis.verdict)}20` }}
                          onClick={() => setSidebarVideo({ video, index: i })}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: verdictColor(analysis.verdict) }}>
                              {analysis.verdict} · {analysis.score}/10
                            </span>
                            <span className="text-[10px] text-[#555]">click to see full breakdown →</span>
                          </div>
                          <p className="text-xs text-[#888] line-clamp-1">🪝 {analysis.hook}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="w-80 border-l border-[#2e2e2e] flex flex-col flex-shrink-0">

          {insightsLoading ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3">
              <Sparkles size={24} className="text-[#4f8ef7] animate-pulse" />
              <p className="text-sm text-[#888] text-center px-4">Claude is analyzing trends across all {displayVideos.length} videos…</p>
              <p className="text-xs text-[#555]">~15 seconds</p>
            </div>

          ) : insights && !sidebarVideo ? (
            <>
              <div className="p-4 border-b border-[#2e2e2e] flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-[#4f8ef7]" />
                  <h2 className="text-sm font-semibold text-[#e8e8e8]">AI Insights</h2>
                </div>
                <button onClick={() => setInsights(null)} className="text-[#555] hover:text-[#e8e8e8] transition-colors"><X size={14} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {insights.split('\n\n').map((section, i) => {
                  const lines = section.split('\n')
                  const heading = lines[0].replace(/\*\*/g, '')
                  const body = lines.slice(1).join('\n')
                  return (
                    <div key={i} className="mb-5">
                      <p className="text-[10px] text-[#888] uppercase tracking-wide mb-2">{heading}</p>
                      <p className="text-xs text-[#e8e8e8] leading-relaxed whitespace-pre-line">{body}</p>
                    </div>
                  )
                })}
              </div>
            </>

          ) : sidebarVideo ? (
            <>
              <div className="p-4 border-b border-[#2e2e2e] flex items-start justify-between flex-shrink-0">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-[#555] mb-1">{sidebarVideo.video.label}</p>
                  <p className="text-xs font-medium text-[#e8e8e8] line-clamp-3 leading-snug">{sidebarVideo.video.title}</p>
                </div>
                <button onClick={() => setSidebarVideo(null)} className="text-[#555] hover:text-[#e8e8e8] ml-2 flex-shrink-0"><X size={14} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {analyzing === sidebarVideo.index ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <RefreshCw size={22} className="animate-spin text-[#a78bfa]" />
                    <p className="text-sm text-[#888]">Analyzing with Claude…</p>
                    <p className="text-xs text-[#555]">~10 seconds</p>
                  </div>
                ) : analyses[sidebarVideo.index] ? (
                  <>
                    {(() => {
                      const a = analyses[sidebarVideo.index]
                      return (
                        <>
                          <div className="flex items-center gap-3 pb-3 border-b border-[#2e2e2e]">
                            <div className="text-4xl font-bold" style={{ color: verdictColor(a.verdict) }}>{a.score}</div>
                            <div>
                              <p className="text-[10px] text-[#888] uppercase tracking-wide">Score / 10</p>
                              <p className="text-sm font-semibold capitalize" style={{ color: verdictColor(a.verdict) }}>{a.verdict}</p>
                            </div>
                          </div>
                          {/* ── Transcript sections ── */}
                          {a.hook && (
                            <div>
                              <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">🪝 Hook</p>
                              <blockquote className="border-l-2 border-[#4f8ef7]/40 pl-3">
                                <p className="text-xs text-[#e8e8e8] leading-relaxed italic">{a.hook}</p>
                              </blockquote>
                            </div>
                          )}
                          {a.body && (
                            <div>
                              <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">📄 Body</p>
                              <blockquote className="border-l-2 border-[#4f8ef7]/40 pl-3">
                                <p className="text-xs text-[#e8e8e8] leading-relaxed italic">{a.body}</p>
                              </blockquote>
                            </div>
                          )}
                          {a.cta && (
                            <div>
                              <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">📣 CTA</p>
                              <blockquote className="border-l-2 border-[#4f8ef7]/40 pl-3">
                                <p className="text-xs text-[#e8e8e8] leading-relaxed italic">{a.cta}</p>
                              </blockquote>
                            </div>
                          )}

                          {/* ── Analysis ── */}
                          <div className="pt-3 border-t border-[#2e2e2e]">
                            <p className="text-[10px] text-[#555] uppercase tracking-wide mb-3">Analysis</p>
                            {a.why_it_worked?.length > 0 && (
                              <div className="mb-3">
                                <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">✅ Why it worked</p>
                                <ul className="space-y-1.5">{a.why_it_worked.map((pt, j) => <li key={j} className="text-xs text-[#e8e8e8] flex gap-1.5"><span className="text-[#555]">•</span>{pt}</li>)}</ul>
                              </div>
                            )}
                            {a.what_to_steal && (
                              <div className="mb-3">
                                <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">💡 What to steal</p>
                                <div className="bg-[#1a2040] border border-[#4f8ef7]/20 rounded-lg p-2.5"><p className="text-xs text-[#e8e8e8] leading-relaxed">{a.what_to_steal}</p></div>
                              </div>
                            )}
                            {a.watch_out && (
                              <div>
                                <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">⚠️ Watch out</p>
                                <p className="text-xs text-[#e8e8e8] leading-relaxed">{a.watch_out}</p>
                              </div>
                            )}
                          </div>
                          <div className="pt-2 border-t border-[#2e2e2e] flex items-center gap-3">
                            <button onClick={() => addToIdeas(sidebarVideo.video)} className="flex items-center gap-1.5 text-xs text-[#4f8ef7] hover:text-[#3a7de8] transition-colors"><Plus size={11} /> Save idea</button>
                            <a href={sidebarVideo.video.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-[#555] hover:text-[#888] transition-colors ml-auto"><ExternalLink size={11} /> Watch on platform</a>
                          </div>
                        </>
                      )
                    })()}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-xs text-[#555] mb-3">No analysis yet for this video</p>
                    <button
                      onClick={() => analyzeVideo(sidebarVideo.video, sidebarVideo.index)}
                      className="flex items-center gap-2 mx-auto px-4 py-2 bg-[#2a1f3d] text-[#c4b5fd] rounded-lg text-sm font-medium hover:bg-[#3d2d5c] transition-colors"
                    >
                      <Zap size={13} /> Analyze this video
                    </button>
                  </div>
                )}
              </div>
            </>

          ) : (
            /* Saved Ideas */
            <>
              <div className="p-4 border-b border-[#2e2e2e] flex-shrink-0">
                <h2 className="text-sm font-semibold text-[#e8e8e8]">Saved Ideas</h2>
                <p className="text-xs text-[#888] mt-0.5">{ideas.length} saved</p>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {ideas.length === 0 ? (
                  <p className="text-xs text-[#555] text-center pt-8">Hit "Save idea" on any video to collect it here.</p>
                ) : ideas.map((idea, i) => (
                  <div key={i} className="bg-[#202020] border border-[#2e2e2e] rounded-card p-3 hover:border-[#3a3a3a] transition-colors">
                    <p className="text-xs text-[#e8e8e8] leading-snug mb-2">{idea}</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => addToContentPipeline(idea)} className="flex items-center gap-1 text-[10px] text-[#4f8ef7] hover:text-[#3a7de8] transition-colors"><ArrowRight size={10} /> Add to pipeline</button>
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
