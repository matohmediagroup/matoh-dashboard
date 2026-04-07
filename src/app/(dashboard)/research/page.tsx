'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Plus, ArrowRight, ExternalLink, Eye, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import type { Client } from '@/types/database'

const COMPETITORS = [
  { handle: '@milesperhr',       platform: 'tiktok' as const,          label: 'Miles Per Hr' },
  { handle: '@omardrives',       platform: 'tiktok' as const,          label: 'Omar Drives' },
  { handle: '@carthrottle',      platform: 'tiktok' as const,          label: 'Car Throttle' },
  { handle: '@carscouted',       platform: 'tiktok' as const,          label: 'Car Scouted' },
  { handle: '@supercarblondie',  platform: 'youtube_shorts' as const,  label: 'Supercar Blondie' },
  { handle: '@carwow',           platform: 'youtube_shorts' as const,  label: 'Carwow' },
  { handle: '@motortrend',       platform: 'youtube_shorts' as const,  label: 'MotorTrend' },
  { handle: '@donutmedia',       platform: 'youtube_shorts' as const,  label: 'Donut Media' },
  { handle: '@supercarblondie',  platform: 'instagram' as const,       label: 'Supercar Blondie' },
  { handle: '@carthrottle',      platform: 'instagram' as const,       label: 'Car Throttle' },
  { handle: '@motortrend',       platform: 'instagram' as const,       label: 'MotorTrend' },
]

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

function platformBadge(platform: TrendVideo['platform']) {
  if (platform === 'tiktok') return '🎵 TikTok'
  if (platform === 'youtube_shorts') return '▶️ YT Shorts'
  if (platform === 'instagram') return '📸 Reels'
  return '▶️ YouTube'
}

// Fetch top videos from YouTube for a channel
async function fetchYouTubeTrends(handle: string, label: string, apiKey: string): Promise<TrendVideo[]> {
  try {
    const searchRes = await fetch(
      `/api/research/youtube?handle=${encodeURIComponent(handle)}&label=${encodeURIComponent(label)}`
    )
    if (!searchRes.ok) return []
    return await searchRes.json() as TrendVideo[]
  } catch {
    return []
  }
}

export default function ResearchPage() {
  const supabase = createClient()
  const [trends, setTrends] = useState<TrendVideo[]>([])
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [ideas, setIdeas] = useState<string[]>([]) // stored in localStorage
  const [lastFetched, setLastFetched] = useState<string | null>(null)

  useEffect(() => {
    // Load ideas from localStorage
    const saved = localStorage.getItem('matoh_research_ideas')
    if (saved) setIdeas(JSON.parse(saved))
    const savedTrends = localStorage.getItem('matoh_research_trends')
    const savedTime = localStorage.getItem('matoh_research_time')
    if (savedTrends) { setTrends(JSON.parse(savedTrends)); setLastFetched(savedTime) }

    supabase.from('clients').select('*').eq('status', 'active').order('name').then(({ data }) => {
      setClients(data ?? [])
    })
  }, [])

  async function fetchTrends() {
    setLoading(true)
    try {
      const res = await fetch('/api/research/trends')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json() as TrendVideo[]
      setTrends(data)
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

  function addToIdeas(video: TrendVideo) {
    const idea = `[${video.label}] ${video.title}`
    if (ideas.includes(idea)) return
    const newIdeas = [idea, ...ideas]
    setIdeas(newIdeas)
    localStorage.setItem('matoh_research_ideas', JSON.stringify(newIdeas))
  }

  function removeIdea(idx: number) {
    const newIdeas = ideas.filter((_, i) => i !== idx)
    setIdeas(newIdeas)
    localStorage.setItem('matoh_research_ideas', JSON.stringify(newIdeas))
  }

  async function addToContentPipeline(idea: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('content_items') as any).insert({
      title: idea,
      filming_status: 'not_filmed',
      edit_status: 'unassigned',
      approval_status: 'pending',
    })
    alert('Added to content schedule!')
  }

  function formatNum(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  const sortedTrends = [...trends].sort((a, b) => b.views - a.views)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2e2e2e] flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-[#e8e8e8]">Content Research</h1>
          <p className="text-xs text-[#888] mt-0.5">
            Top short-form content from TikTok, Instagram Reels &amp; YouTube Shorts
            {lastFetched && ` · Last refreshed ${new Date(lastFetched).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>
        <Button onClick={fetchTrends} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Fetching…' : 'Refresh Trends'}
        </Button>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {/* Trends */}
        <div className="flex-1 overflow-y-auto p-6">
          {trends.length === 0 && !loading ? (
            <div className="text-center py-20">
              <TrendingUp size={40} className="mx-auto mb-3 text-[#555]" />
              <p className="text-[#888] text-sm mb-4">Hit "Refresh Trends" to pull the latest top-performing videos from automotive creators.</p>
              <Button onClick={fetchTrends}>Fetch Trends Now</Button>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <RefreshCw size={28} className="animate-spin text-[#4f8ef7]" />
              <p className="text-sm text-[#888]">Fetching trending content from {COMPETITORS.length} accounts…</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedTrends.map((video, i) => (
                <div key={i} className="bg-[#202020] border border-[#2e2e2e] rounded-card overflow-hidden group">
                  {video.thumbnail && (
                    <div className="relative">
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="w-full h-36 object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                      <div className="absolute top-2 left-2">
                        <Badge
                          variant="default"
                          label={platformBadge(video.platform)}
                        />
                      </div>
                    </div>
                  )}
                  <div className="p-3">
                    <p className="text-xs text-[#888] mb-1">{video.label}</p>
                    <p className="text-sm font-medium text-[#e8e8e8] line-clamp-2 mb-2 leading-snug">{video.title}</p>
                    <div className="flex items-center gap-3 text-xs text-[#888] mb-3">
                      <span className="flex items-center gap-1"><Eye size={11} /> {formatNum(video.views)}</span>
                      <span>{formatNum(video.likes)} likes</span>
                      <span>{formatNum(video.comments)} comments</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => addToIdeas(video)}
                        className="flex items-center gap-1 text-xs text-[#4f8ef7] hover:text-[#3a7de8] transition-colors"
                      >
                        <Plus size={11} /> Add to ideas
                      </button>
                      <a href={video.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-[#888] hover:text-[#e8e8e8] transition-colors ml-auto">
                        <ExternalLink size={11} /> View
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ideas sidebar */}
        <div className="w-72 border-l border-[#2e2e2e] flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-[#2e2e2e]">
            <h2 className="text-sm font-semibold text-[#e8e8e8]">Content Ideas</h2>
            <p className="text-xs text-[#888] mt-0.5">{ideas.length} saved</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {ideas.length === 0 ? (
              <p className="text-xs text-[#555] text-center pt-8">Click "Add to ideas" on any video to save it here.</p>
            ) : ideas.map((idea, i) => (
              <div key={i} className="bg-[#202020] border border-[#2e2e2e] rounded-card p-3">
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
                    className="text-[10px] text-[#888] hover:text-[#ef4444] transition-colors ml-auto"
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
