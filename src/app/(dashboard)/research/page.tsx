'use client'

import { useEffect, useState, useRef } from 'react'
import { Search, RefreshCw, Plus, ArrowRight, ExternalLink, Eye, TrendingUp, X, Zap } from 'lucide-react'
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
  if (p === 'instagram') return '📸 Reels'
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

  // Analysis
  const [activeIndex, setActiveIndex] = useState<number | null>(null)   // which card is being analyzed
  const [activeVideo, setActiveVideo] = useState<TrendVideo | null>(null) // the video in the sidebar
  const [activeAnalysis, setActiveAnalysis] = useState<Analysis | null>(null)
  const [activeTranscript, setActiveTranscript] = useState<string | null>(null)
  const [analyzeLoading, setAnalyzeLoading] = useState(false)
  const [analyzeError, setAnalyzeError] = useState(false)

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

  // ── Fetch trends ─────────────────────────────────────────────────────────────

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
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // ── Search ────────────────────────────────────────────────────────────────────

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
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
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

  // ── Ideas ─────────────────────────────────────────────────────────────────────

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

  // ── Analyze ───────────────────────────────────────────────────────────────────

  async function analyzeVideo(video: TrendVideo, index: number) {
    // Show sidebar immediately with loading state
    setActiveVideo(video)
    setActiveIndex(index)
    setActiveAnalysis(null)
    setActiveTranscript(null)
    setAnalyzeLoading(true)
    setAnalyzeError(false)

    try {
      let videoId: string | undefined
      if (video.platform === 'youtube_shorts' || video.platform === 'youtube') {
        const m1 = video.url.match(/youtube\.com\/shorts\/([^?&/]+)/)
        const m2 = video.url.match(/[?&]v=([^&]+)/)
        videoId = m1?.[1] || m2?.[1]
      }

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
      if (!res.ok || data.error) {
        setAnalyzeError(true)
        return
      }
      setActiveAnalysis(data.analysis as Analysis)
      setActiveTranscript(data.transcript ?? null)
    } catch (e) {
      console.error(e)
      setAnalyzeError(true)
    } finally {
      setAnalyzeLoading(false)
    }
  }

  function closeSidebar() {
    setActiveVideo(null)
    setActiveIndex(null)
    setActiveAnalysis(null)
    setAnalyzeLoading(false)
    setAnalyzeError(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const displayVideos = mode === 'search' ? searchResults : trendResults
  const showAnalysisSidebar = activeVideo !== null

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
                : `Top short-form content from competitor accounts${lastFetched
                    ? ` · ${new Date(lastFetched).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                    : ''}`}
            </p>
          </div>
          <Button onClick={fetchTrends} disabled={loading} variant="ghost">
            <RefreshCw size={13} className={loading && mode === 'trends' ? 'animate-spin' : ''} />
            Refresh Trends
          </Button>
        </div>

        {/* Search bar */}
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
              className={`px-3 py-2 rounded-card text-xs font-medium border transition-colors ${
                platforms.includes(p)
                  ? 'border-[#3a3a3a] bg-[#252525] text-[#e8e8e8]'
                  : 'border-[#2e2e2e] bg-transparent text-[#555] hover:text-[#888]'
              }`}
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

        {/* Quick chips */}
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
              <p className="text-sm text-[#888]">
                {mode === 'search' ? `Searching for "${query}"…` : 'Fetching trending videos…'}
              </p>
            </div>
          ) : displayVideos.length === 0 ? (
            <div className="text-center py-20">
              <TrendingUp size={40} className="mx-auto mb-3 text-[#555]" />
              {mode === 'search' ? (
                <>
                  <p className="text-[#888] text-sm mb-2">No results for "{query}"</p>
                  <p className="text-xs text-[#555]">Try a different keyword or handle</p>
                </>
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
                  className={`bg-[#202020] border rounded-card overflow-hidden transition-colors ${
                    activeIndex === i ? 'border-[#a78bfa]' : 'border-[#2e2e2e] hover:border-[#3a3a3a]'
                  }`}
                >
                  {/* Thumbnail */}
                  {video.thumbnail ? (
                    <div className="relative">
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="w-full h-36 object-cover"
                        onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }}
                      />
                      <div className="absolute top-2 left-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: 'rgba(0,0,0,0.7)', color: platformColor(video.platform) }}>
                          {platformBadge(video.platform)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="h-10 flex items-center px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#252525', color: platformColor(video.platform) }}>
                        {platformBadge(video.platform)}
                      </span>
                    </div>
                  )}

                  <div className="p-3">
                    <p className="text-[11px] text-[#555] mb-1">{video.label || video.handle}</p>
                    <p className="text-sm font-medium text-[#e8e8e8] line-clamp-2 mb-2 leading-snug">{video.title || '(no caption)'}</p>
                    <div className="flex items-center gap-3 text-xs text-[#888] mb-3">
                      <span className="flex items-center gap-1"><Eye size={11} /> {formatNum(video.views)}</span>
                      <span>♥ {formatNum(video.likes)}</span>
                      <span>💬 {formatNum(video.comments)}</span>
                    </div>

                    {/* Action row */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => addToIdeas(video)}
                        className="flex items-center gap-1 text-xs text-[#4f8ef7] hover:text-[#3a7de8] transition-colors"
                      >
                        <Plus size={11} /> Save idea
                      </button>

                      <button
                        onClick={() => analyzeVideo(video, i)}
                        className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded bg-[#2a1f3d] text-[#c4b5fd] hover:bg-[#3d2d5c] transition-colors"
                      >
                        <Zap size={11} />
                        {activeIndex === i && analyzeLoading ? 'Analyzing…' : 'Analyze'}
                      </button>

                      <a
                        href={video.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-[#888] hover:text-[#e8e8e8] transition-colors ml-auto"
                      >
                        <ExternalLink size={11} /> View
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right sidebar — toggles between Saved Ideas and Analysis */}
        <div className="w-80 border-l border-[#2e2e2e] flex flex-col flex-shrink-0">

          {showAnalysisSidebar ? (
            /* ── Analysis panel ── */
            <>
              <div className="p-4 border-b border-[#2e2e2e] flex items-start justify-between gap-2 flex-shrink-0">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-[#888] mb-0.5">{platformBadge(activeVideo.platform)}</p>
                  <p className="text-xs font-medium text-[#e8e8e8] line-clamp-2 leading-snug">{activeVideo.title || '(no caption)'}</p>
                </div>
                <button onClick={closeSidebar} className="text-[#555] hover:text-[#e8e8e8] transition-colors flex-shrink-0">
                  <X size={14} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {analyzeLoading && (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <RefreshCw size={24} className="animate-spin text-[#a78bfa]" />
                    <p className="text-sm text-[#888]">Analyzing with Claude…</p>
                    <p className="text-xs text-[#555]">~5–10 seconds</p>
                  </div>
                )}

                {analyzeError && !analyzeLoading && (
                  <div className="text-center py-10">
                    <p className="text-sm text-[#ef4444] mb-3">Analysis failed</p>
                    <button onClick={() => analyzeVideo(activeVideo, activeIndex!)} className="text-xs text-[#4f8ef7] hover:underline">
                      Try again
                    </button>
                  </div>
                )}

                {activeAnalysis && !analyzeLoading && (
                  <>
                    {/* Score */}
                    <div className="flex items-center gap-3 pb-3 border-b border-[#2e2e2e]">
                      <div className="text-4xl font-bold" style={{ color: verdictColor(activeAnalysis.verdict) }}>
                        {activeAnalysis.score}
                      </div>
                      <div>
                        <p className="text-[10px] text-[#888] uppercase tracking-wide">Score / 10</p>
                        <p className="text-sm font-semibold capitalize" style={{ color: verdictColor(activeAnalysis.verdict) }}>
                          {activeAnalysis.verdict}
                        </p>
                      </div>
                    </div>

                    {activeAnalysis.hook && (
                      <div>
                        <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">🪝 Hook</p>
                        <p className="text-xs text-[#e8e8e8] leading-relaxed">{activeAnalysis.hook}</p>
                      </div>
                    )}

                    {activeAnalysis.structure && (
                      <div>
                        <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">📐 Structure</p>
                        <p className="text-xs text-[#e8e8e8] leading-relaxed">{activeAnalysis.structure}</p>
                      </div>
                    )}

                    {activeAnalysis.cta && (
                      <div>
                        <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">📣 CTA</p>
                        <p className="text-xs text-[#e8e8e8] leading-relaxed">{activeAnalysis.cta}</p>
                      </div>
                    )}

                    {activeAnalysis.why_it_worked?.length > 0 && (
                      <div>
                        <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">✅ Why it worked</p>
                        <ul className="space-y-1.5">
                          {activeAnalysis.why_it_worked.map((pt, j) => (
                            <li key={j} className="text-xs text-[#e8e8e8] flex gap-1.5">
                              <span className="text-[#555] flex-shrink-0">•</span>{pt}
                            </li>
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

                    {activeAnalysis.watch_out && (
                      <div>
                        <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">⚠️ Watch out</p>
                        <p className="text-xs text-[#e8e8e8] leading-relaxed">{activeAnalysis.watch_out}</p>
                      </div>
                    )}

                    {activeTranscript && (
                      <details>
                        <summary className="text-[10px] text-[#555] hover:text-[#888] cursor-pointer select-none">
                          View Transcript
                        </summary>
                        <div className="mt-2 max-h-32 overflow-y-auto bg-[#191919] border border-[#2e2e2e] rounded-lg p-2">
                          <p className="text-[10px] text-[#888] leading-relaxed whitespace-pre-wrap">{activeTranscript}</p>
                        </div>
                      </details>
                    )}

                    <div className="pt-2 border-t border-[#2e2e2e]">
                      <button
                        onClick={() => { addToIdeas(activeVideo); closeSidebar() }}
                        className="flex items-center gap-1.5 text-xs text-[#4f8ef7] hover:text-[#3a7de8] transition-colors"
                      >
                        <Plus size={11} /> Save to Ideas
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            /* ── Saved Ideas panel ── */
            <>
              <div className="p-4 border-b border-[#2e2e2e] flex-shrink-0">
                <h2 className="text-sm font-semibold text-[#e8e8e8]">Saved Ideas</h2>
                <p className="text-xs text-[#888] mt-0.5">{ideas.length} saved · click "Add to pipeline" to push to Content Board</p>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {ideas.length === 0 ? (
                  <p className="text-xs text-[#555] text-center pt-8">Hit "Save idea" on any video to collect it here.</p>
                ) : ideas.map((idea, i) => (
                  <div key={i} className="bg-[#202020] border border-[#2e2e2e] rounded-card p-3 hover:border-[#3a3a3a] transition-colors">
                    <p className="text-xs text-[#e8e8e8] leading-snug mb-2">{idea}</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => addToContentPipeline(idea)}
                        className="flex items-center gap-1 text-[10px] text-[#4f8ef7] hover:text-[#3a7de8] transition-colors"
                      >
                        <ArrowRight size={10} /> Add to pipeline
                      </button>
                      <button
                        onClick={() => removeIdea(i)}
                        className="text-[10px] text-[#555] hover:text-[#ef4444] transition-colors ml-auto"
                      >
                        Remove
                      </button>
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
