'use client'

import { useEffect, useState, useRef } from 'react'
import { Search, RefreshCw, Plus, ArrowRight, ExternalLink, Eye, TrendingUp, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import type { Client } from '@/types/database'

// ─── Types ────────────────────────────────────────────────────────────────────

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
}

type Platform = 'youtube' | 'tiktok' | 'instagram'

// ─── Preset competitor accounts ───────────────────────────────────────────────

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
  youtube:   '#ef4444',
  tiktok:    '#e8e8e8',
  instagram: '#a855f7',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function platformBadge(platform: TrendVideo['platform']) {
  if (platform === 'tiktok')         return '🎵 TikTok'
  if (platform === 'youtube_shorts') return '▶ YT Shorts'
  if (platform === 'instagram')      return '📸 Reels'
  return '▶ YouTube'
}

function platformColor(platform: TrendVideo['platform']) {
  if (platform === 'tiktok')         return '#e8e8e8'
  if (platform === 'youtube_shorts') return '#ef4444'
  if (platform === 'instagram')      return '#a855f7'
  return '#ef4444'
}

function formatNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ResearchPage() {
  const supabase = createClient()

  const [query, setQuery]               = useState('')
  const [platforms, setPlatforms]       = useState<Platform[]>(['youtube', 'tiktok', 'instagram'])
  const [searchResults, setSearchResults] = useState<TrendVideo[]>([])
  const [trendResults, setTrendResults] = useState<TrendVideo[]>([])
  const [ideas, setIdeas]               = useState<string[]>([])
  const [mode, setMode]                 = useState<'trends' | 'search'>('trends')
  const [loading, setLoading]           = useState(false)
  const [lastFetched, setLastFetched]   = useState<string | null>(null)
  const [clients, setClients]           = useState<Client[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('matoh_research_ideas')
    if (saved) setIdeas(JSON.parse(saved))
    const savedTrends = localStorage.getItem('matoh_research_trends')
    const savedTime   = localStorage.getItem('matoh_research_time')
    if (savedTrends) { setTrendResults(JSON.parse(savedTrends)); setLastFetched(savedTime) }
    supabase.from('clients').select('*').eq('status', 'active').order('name').then(({ data }) => setClients(data ?? []))
  }, [])

  // ── Fetch competitor trends ──────────────────────────────────────────────

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

  // ── Search ───────────────────────────────────────────────────────────────

  async function runSearch(q?: string, overridePlatforms?: Platform[]) {
    const searchQuery = (q ?? query).trim()
    if (!searchQuery) return
    setLoading(true)
    setMode('search')
    try {
      const ps = overridePlatforms ?? platforms
      const params = new URLSearchParams({ q: searchQuery, platforms: ps.join(',') })
      const res = await fetch(`/api/research/search?${params}`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json() as TrendVideo[]
      setSearchResults(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') runSearch()
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

  function chipSearch(handle: string, platform: Platform) {
    const q = handle
    setQuery(q)
    const ps: Platform[] = platform === 'youtube' ? ['youtube'] : [platform]
    setPlatforms(ps)
    runSearch(q, ps)
  }

  // ── Ideas ───────────────────────────────────────────────────────────────

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

  // ── Render ───────────────────────────────────────────────────────────────

  const displayVideos = mode === 'search' ? searchResults : trendResults

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ── */}
      <div className="px-6 py-4 border-b border-[#2e2e2e] flex-shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#e8e8e8]">Content Research</h1>
            <p className="text-xs text-[#888] mt-0.5">
              {mode === 'search'
                ? `${searchResults.length} results for "${query}"`
                : `Top short-form content from competitor accounts${lastFetched ? ` · ${new Date(lastFetched).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}`
              }
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
              onKeyDown={handleKeyDown}
              placeholder="Search keywords, #hashtags, or @accounts…"
              className="w-full pl-9 pr-8 py-2.5 bg-[#191919] border border-[#2e2e2e] rounded-card text-sm text-[#e8e8e8] placeholder-[#555] focus:outline-none focus:border-[#4f8ef7] transition-colors"
            />
            {query && (
              <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#888]">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Platform toggles */}
          <div className="flex items-center gap-1">
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
          </div>

          <Button onClick={() => runSearch()} disabled={!query.trim() || loading}>
            {loading && mode === 'search' ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
            Search
          </Button>
        </div>

        {/* Quick-chips */}
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

      {/* ── Body ── */}
      <div className="flex-1 overflow-hidden flex">

        {/* Results grid */}
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
                  <p className="text-[#888] text-sm mb-2">No results found for "{query}"</p>
                  <p className="text-xs text-[#555]">Try a different keyword or account handle</p>
                </>
              ) : (
                <>
                  <p className="text-[#888] text-sm mb-4">Search for keywords or hit "Refresh Trends" to see top competitor videos.</p>
                  <Button onClick={fetchTrends}>Load Competitor Trends</Button>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayVideos.map((video, i) => (
                <div key={i} className="bg-[#202020] border border-[#2e2e2e] rounded-card overflow-hidden hover:border-[#3a3a3a] transition-colors group">
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
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-semibold"
                          style={{ background: 'rgba(0,0,0,0.7)', color: platformColor(video.platform) }}
                        >
                          {platformBadge(video.platform)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="h-10 flex items-center px-3">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-semibold"
                        style={{ background: '#252525', color: platformColor(video.platform) }}
                      >
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
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => addToIdeas(video)}
                        className="flex items-center gap-1 text-xs text-[#4f8ef7] hover:text-[#3a7de8] transition-colors"
                      >
                        <Plus size={11} /> Save idea
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

        {/* ── Ideas sidebar ── */}
        <div className="w-72 border-l border-[#2e2e2e] flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-[#2e2e2e]">
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
        </div>

      </div>
    </div>
  )
}
