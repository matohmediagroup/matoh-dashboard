'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Settings, Eye, MessageCircle, Heart, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { PageSpinner } from '@/components/ui/Spinner'
import type { Client } from '@/types/database'

type Platform = 'tiktok' | 'instagram' | 'youtube'

interface SocialAccount {
  id: string
  client_id: string
  platform: Platform
  handle: string
}

interface VideoItem {
  title: string
  views: number
  likes: number
  comments: number
  url: string
  thumbnail: string
  date: string
}

interface SocialStats {
  id: string
  client_id: string
  platform: Platform
  followers: number
  total_views: number
  total_likes: number
  avg_views: number
  post_count: number
  latest_videos: VideoItem[]
  refreshed_at: string
}

const PLATFORM_CONFIG: Record<Platform, { label: string; color: string; bg: string; icon: string }> = {
  tiktok:    { label: 'TikTok',    color: '#f1f1f1', bg: '#ffffff12', icon: '♪' },
  instagram: { label: 'Instagram', color: '#e1306c', bg: '#e1306c12', icon: '◈' },
  youtube:   { label: 'YouTube',   color: '#ef4444', bg: '#ef444412', icon: '▶' },
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// The API now stores 30-day aggregates directly in total_views / total_likes / post_count.
// Comments aren't a dedicated column, so we sum them from latest_videos filtered to 30d.
function comments30Days(videos: VideoItem[]): number {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  return (videos ?? [])
    .filter(v => v.date && new Date(v.date) >= cutoff)
    .reduce((s, v) => s + (v.comments || 0), 0)
}

function get30DayStats(stat: SocialStats) {
  return {
    views:    stat.total_views,
    likes:    stat.total_likes,
    comments: comments30Days(stat.latest_videos),
    posts:    stat.post_count,
  }
}

export default function SocialPage() {
  const supabase = createClient()
  const [clients,      setClients]      = useState<Client[]>([])
  const [accounts,     setAccounts]     = useState<SocialAccount[]>([])
  const [stats,        setStats]        = useState<SocialStats[]>([])
  const [loading,      setLoading]      = useState(true)
  const [refreshing,   setRefreshing]   = useState<string>('')
  const [expanded,     setExpanded]     = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState<Client | null>(null)
  const [handles,      setHandles]      = useState({ tiktok: '', instagram: '', youtube: '' })
  const [savingHandles, setSavingHandles] = useState(false)
  const [selectedClient, setSelectedClient] = useState<string>('all')

  const fetchData = useCallback(async () => {
    const [{ data: clientsData }, { data: accountsData }, { data: statsData }] = await Promise.all([
      supabase.from('clients').select('*').eq('status', 'active').order('name'),
      supabase.from('social_accounts').select('*'),
      supabase.from('social_stats').select('*'),
    ])
    const EXCLUDED = ['cdf', 'legends', 'phillips']
    setClients((clientsData ?? []).filter(c =>
      !EXCLUDED.some(kw => c.name.toLowerCase().includes(kw))
    ))
    setAccounts(accountsData ?? [])
    setStats(statsData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function getAccount(clientId: string, platform: Platform) {
    return accounts.find(a => a.client_id === clientId && a.platform === platform)
  }

  function getStat(clientId: string, platform: Platform) {
    return stats.find(s => s.client_id === clientId && s.platform === platform)
  }

  async function refreshPlatform(clientId: string, platform: Platform) {
    const key = `${clientId}-${platform}`
    setRefreshing(key)
    try {
      await fetch('/api/social/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, platform }),
      })
      await fetchData()
    } finally { setRefreshing('') }
  }

  async function refreshAllForClient(clientId: string) {
    for (const platform of ['tiktok', 'instagram', 'youtube'] as Platform[]) {
      if (getAccount(clientId, platform)) {
        await refreshPlatform(clientId, platform)
      }
    }
  }

  function openSettings(client: Client) {
    setHandles({
      tiktok:    getAccount(client.id, 'tiktok')?.handle    ?? '',
      instagram: getAccount(client.id, 'instagram')?.handle ?? '',
      youtube:   getAccount(client.id, 'youtube')?.handle   ?? '',
    })
    setShowSettings(client)
  }

  async function saveHandles() {
    if (!showSettings) return
    setSavingHandles(true)
    const clientId = showSettings.id
    for (const platform of ['tiktok', 'instagram', 'youtube'] as Platform[]) {
      const handle = handles[platform].trim()
      if (handle) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('social_accounts') as any).upsert(
          { client_id: clientId, platform, handle },
          { onConflict: 'client_id,platform' }
        )
      } else {
        await supabase.from('social_accounts').delete()
          .eq('client_id', clientId).eq('platform', platform)
      }
    }
    setSavingHandles(false)
    setShowSettings(null)
    fetchData()
  }

  if (loading) return <PageSpinner />

  const displayedClients = selectedClient === 'all'
    ? clients
    : clients.filter(c => c.id === selectedClient)

  // Global 30-day totals across all clients
  const global30 = clients.reduce((acc, c) => {
    const platforms: Platform[] = ['tiktok', 'instagram', 'youtube']
    for (const p of platforms) {
      const stat = getStat(c.id, p)
      if (!stat) continue
      const d = get30DayStats(stat)
      acc.views    += d.views
      acc.likes    += d.likes
      acc.comments += d.comments
    }
    return acc
  }, { views: 0, likes: 0, comments: 0 })

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2e2e2e] flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-[#e8e8e8]">Social Media</h1>
          <p className="text-xs text-[#555] mt-0.5">Last 30 days across all clients & platforms</p>
        </div>
        <select
          value={selectedClient}
          onChange={e => setSelectedClient(e.target.value)}
          className="px-3 py-1.5 rounded-card bg-[#191919] border border-[#2e2e2e] text-[#888] text-xs focus:outline-none"
        >
          <option value="all">All Clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Global 30-day KPI strip */}
      <div className="flex gap-4 px-6 py-3 border-b border-[#2e2e2e] bg-[#191919] flex-shrink-0">
        {[
          { label: 'Total Views (30d)',    value: formatNum(global30.views),    icon: Eye,            color: '#4f8ef7' },
          { label: 'Total Likes (30d)',    value: formatNum(global30.likes),    icon: Heart,          color: '#f472b6' },
          { label: 'Total Comments (30d)', value: formatNum(global30.comments), icon: MessageCircle,  color: '#a78bfa' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="flex items-center gap-3 bg-[#202020] border border-[#2e2e2e] rounded-card px-4 py-2.5 min-w-max">
            <Icon size={16} style={{ color }} />
            <div>
              <p className="text-[10px] text-[#888]">{label}</p>
              <p className="text-lg font-semibold text-[#e8e8e8]">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Client cards */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {displayedClients.map(client => {
          const isExpanded = expanded === client.id
          const platforms: Platform[] = ['tiktok', 'instagram', 'youtube']

          // Combined 30-day totals for this client across all platforms
          const combined = platforms.reduce((acc, p) => {
            const stat = getStat(client.id, p)
            if (!stat) return acc
            const d = get30DayStats(stat)
            acc.views    += d.views
            acc.likes    += d.likes
            acc.comments += d.comments
            acc.posts    += d.posts
            return acc
          }, { views: 0, likes: 0, comments: 0, posts: 0 })

          const hasAnyData = platforms.some(p => getStat(client.id, p))

          return (
            <div key={client.id} className="bg-[#202020] border border-[#2e2e2e] rounded-card overflow-hidden">

              {/* Client header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-[#2e2e2e]">
                <div
                  className="w-8 h-8 rounded-card flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: `${client.color}22`, color: client.color }}
                >
                  {client.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[#e8e8e8]">{client.name}</h3>
                  {hasAnyData && (
                    <div className="flex items-center gap-4 mt-0.5">
                      <span className="flex items-center gap-1 text-xs text-[#888]"><Eye size={10} className="text-[#4f8ef7]" /> {formatNum(combined.views)}</span>
                      <span className="flex items-center gap-1 text-xs text-[#888]"><Heart size={10} className="text-[#f472b6]" /> {formatNum(combined.likes)}</span>
                      <span className="flex items-center gap-1 text-xs text-[#888]"><MessageCircle size={10} className="text-[#a78bfa]" /> {formatNum(combined.comments)}</span>
                      <span className="text-[10px] text-[#555]">{combined.posts} posts · last 30 days</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => refreshAllForClient(client.id)} disabled={!!refreshing.startsWith(client.id)}>
                    <RefreshCw size={12} className={refreshing.startsWith(client.id) ? 'animate-spin' : ''} />
                    Refresh All
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openSettings(client)}>
                    <Settings size={12} /> Handles
                  </Button>
                  <button
                    onClick={() => setExpanded(isExpanded ? null : client.id)}
                    className="p-1.5 rounded-card text-[#888] hover:text-[#e8e8e8] hover:bg-[#2a2a2a] transition-colors"
                  >
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>

              {/* Platform breakdown — 3 columns */}
              <div className="grid grid-cols-3 divide-x divide-[#2e2e2e]">
                {platforms.map(platform => {
                  const account = getAccount(client.id, platform)
                  const stat    = getStat(client.id, platform)
                  const cfg     = PLATFORM_CONFIG[platform]
                  const isRefreshing = refreshing === `${client.id}-${platform}`
                  const d30     = stat ? get30DayStats(stat) : null

                  return (
                    <div key={platform} className="p-5">
                      {/* Platform label row */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-sm font-bold"
                            style={{ background: cfg.bg, color: cfg.color }}
                          >
                            {cfg.icon}
                          </span>
                          <div>
                            <p className="text-xs font-semibold text-[#e8e8e8]">{cfg.label}</p>
                            {account && <p className="text-[10px] text-[#555]">{account.handle}</p>}
                          </div>
                        </div>
                        {account && (
                          <button
                            onClick={() => refreshPlatform(client.id, platform)}
                            disabled={isRefreshing}
                            className="p-1 text-[#555] hover:text-[#888] transition-colors"
                          >
                            <RefreshCw size={11} className={isRefreshing ? 'animate-spin' : ''} />
                          </button>
                        )}
                      </div>

                      {!account ? (
                        <p className="text-xs text-[#555]">No handle set</p>
                      ) : !stat ? (
                        <p className="text-xs text-[#555]">Not fetched yet — hit refresh</p>
                      ) : (
                        <>
                          {/* Followers */}
                          <div className="mb-4 pb-4 border-b border-[#2a2a2a]">
                            <p className="text-[10px] text-[#555] uppercase tracking-wide mb-0.5">Followers</p>
                            <p className="text-xl font-bold text-[#e8e8e8]">{formatNum(stat.followers)}</p>
                          </div>

                          {/* Last 30 days metrics */}
                          <p className="text-[10px] text-[#555] uppercase tracking-wide mb-3">Last 30 Days</p>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 text-xs text-[#888]">
                                <Eye size={11} className="text-[#4f8ef7]" /> Views
                              </span>
                              <span className="text-sm font-semibold text-[#e8e8e8]">{d30 ? formatNum(d30.views) : '—'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 text-xs text-[#888]">
                                <Heart size={11} className="text-[#f472b6]" /> Likes
                              </span>
                              <span className="text-sm font-semibold text-[#e8e8e8]">{d30 ? formatNum(d30.likes) : '—'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 text-xs text-[#888]">
                                <MessageCircle size={11} className="text-[#a78bfa]" /> Comments
                              </span>
                              <span className="text-sm font-semibold text-[#e8e8e8]">{d30 ? formatNum(d30.comments) : '—'}</span>
                            </div>
                            <div className="flex items-center justify-between pt-1 border-t border-[#2a2a2a]">
                              <span className="text-xs text-[#555]">Posts in period</span>
                              <span className="text-xs font-medium text-[#888]">{d30?.posts ?? '—'}</span>
                            </div>
                            {d30 && d30.posts > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-[#555]">Avg views/post</span>
                                <span className="text-xs font-medium text-[#888]">{formatNum(Math.round(d30.views / d30.posts))}</span>
                              </div>
                            )}
                          </div>

                          <p className="text-[9px] text-[#444] mt-4">
                            Refreshed {new Date(stat.refreshed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Expanded: recent videos per platform */}
              {isExpanded && (
                <div className="border-t border-[#2e2e2e] p-5">
                  <h4 className="text-xs font-semibold text-[#888] uppercase tracking-wide mb-4">Recent Videos</h4>
                  <div className="space-y-6">
                    {platforms.map(platform => {
                      const stat = getStat(client.id, platform)
                      const cfg  = PLATFORM_CONFIG[platform]
                      if (!stat?.latest_videos?.length) return null

                      return (
                        <div key={platform}>
                          <p className="flex items-center gap-1.5 text-xs font-medium mb-3" style={{ color: cfg.color }}>
                            <span>{cfg.icon}</span> {cfg.label}
                          </p>
                          <div className="space-y-1">
                            {stat.latest_videos.slice(0, 10).map((video, i) => {
                              const isRecent = video.date && new Date(video.date) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                              return (
                                <a
                                  key={i}
                                  href={video.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#2a2a2a] transition-colors group"
                                >
                                  {video.thumbnail && (
                                    <img
                                      src={video.thumbnail}
                                      alt=""
                                      className="w-10 h-10 object-cover rounded-lg flex-shrink-0"
                                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                                    />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs text-[#e8e8e8] line-clamp-1 group-hover:text-[#4f8ef7] transition-colors">
                                      {video.title || 'Untitled'}
                                    </p>
                                    <div className="flex items-center gap-3 mt-0.5">
                                      <span className="flex items-center gap-0.5 text-[10px] text-[#888]"><Eye size={9} className="text-[#4f8ef7]" /> {formatNum(video.views)}</span>
                                      <span className="flex items-center gap-0.5 text-[10px] text-[#888]"><Heart size={9} className="text-[#f472b6]" /> {formatNum(video.likes)}</span>
                                      <span className="flex items-center gap-0.5 text-[10px] text-[#888]"><MessageCircle size={9} className="text-[#a78bfa]" /> {formatNum(video.comments)}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {isRecent && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#14532d] text-[#4ade80]">30d</span>
                                    )}
                                    {video.date && (
                                      <span className="text-[10px] text-[#555]">
                                        {new Date(video.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                      </span>
                                    )}
                                    <ExternalLink size={10} className="text-[#444] group-hover:text-[#888]" />
                                  </div>
                                </a>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Settings modal */}
      <Modal open={!!showSettings} onClose={() => setShowSettings(null)} title={`${showSettings?.name} — Social Handles`}>
        <div className="space-y-3">
          <p className="text-xs text-[#888]">Enter the handle for each platform.</p>
          <Input label="♪ TikTok Handle" value={handles.tiktok} onChange={e => setHandles(p => ({ ...p, tiktok: e.target.value }))} placeholder="@vwpacific" />
          <Input label="◈ Instagram Handle" value={handles.instagram} onChange={e => setHandles(p => ({ ...p, instagram: e.target.value }))} placeholder="@vwpacific" />
          <Input label="▶ YouTube Handle / Channel" value={handles.youtube} onChange={e => setHandles(p => ({ ...p, youtube: e.target.value }))} placeholder="Volkswagen Pacific" />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setShowSettings(null)}>Cancel</Button>
            <Button onClick={saveHandles} disabled={savingHandles}>{savingHandles ? 'Saving…' : 'Save Handles'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
