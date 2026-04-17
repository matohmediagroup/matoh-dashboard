'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Settings, Eye, MessageCircle, Heart, ExternalLink, TrendingUp } from 'lucide-react'
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts'
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
  tiktok:    { label: 'TikTok',    color: '#f1f1f1', bg: '#ffffff14', icon: '♪' },
  instagram: { label: 'Instagram', color: '#e1306c', bg: '#e1306c14', icon: '◈' },
  youtube:   { label: 'YouTube',   color: '#ff4444', bg: '#ff444414', icon: '▶' },
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function get30DayStats(stat: SocialStats) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const now    = new Date()
  const recent = (stat.latest_videos ?? []).filter(v => {
    if (!v.date) return false
    const d = new Date(v.date)
    return !isNaN(d.getTime()) && d >= cutoff && d <= now
  })
  return {
    views:    recent.reduce((s, v) => s + (v.views    || 0), 0),
    likes:    recent.reduce((s, v) => s + (v.likes    || 0), 0),
    comments: recent.reduce((s, v) => s + (v.comments || 0), 0),
    posts:    recent.length,
  }
}

// ── Cumulative reach area chart ───────────────────────────────────────────────
// Filters videos to the last 30 days, sorts oldest → newest, then builds a
// running total of views so the chart shows total accumulated reach over time.

function CumulativeChart({ videos, platform, clientId }: {
  videos: VideoItem[]
  platform: Platform
  clientId: string
}) {
  const cfg    = PLATFORM_CONFIG[platform]
  const gradId = `g-${clientId.slice(0, 6)}-${platform}`
  const now    = new Date()
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const minDate = new Date('2020-01-01')

  const sorted = (videos ?? [])
    .filter(v => {
      if (!v.date) return false
      const d = new Date(v.date)
      return !isNaN(d.getTime()) && d >= cutoff && d <= now && d >= minDate
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  if (sorted.length < 2) {
    return (
      <div className="h-28 flex items-center justify-center">
        <p className="text-[11px] text-[#444]">No data — hit refresh</p>
      </div>
    )
  }

  let running = 0
  const data = sorted.map(v => {
    running += v.views || 0
    const label = new Date(v.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return { label, total: running }
  })

  return (
    <div className="h-28">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 2, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={cfg.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={cfg.color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: '#555' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <Tooltip
            cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
            content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null
              return (
                <div className="bg-[#161616] border border-[#2a2a2a] rounded-lg px-3 py-2 text-[11px] shadow-xl">
                  <p className="font-bold" style={{ color: cfg.color }}>{formatNum(payload[0].value)} total reach</p>
                </div>
              )
            }}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke={cfg.color}
            strokeWidth={1.5}
            fill={`url(#${gradId})`}
            dot={false}
            activeDot={{ r: 3, fill: cfg.color, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SocialPage() {
  const supabase = createClient()
  const [clients,       setClients]       = useState<Client[]>([])
  const [accounts,      setAccounts]      = useState<SocialAccount[]>([])
  const [stats,         setStats]         = useState<SocialStats[]>([])
  const [loading,       setLoading]       = useState(true)
  const [refreshing,    setRefreshing]    = useState<string>('')
  const [showSettings,  setShowSettings]  = useState<Client | null>(null)
  const [handles,       setHandles]       = useState({ tiktok: '', instagram: '', youtube: '' })
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

  const getAccount = (clientId: string, p: Platform) =>
    accounts.find(a => a.client_id === clientId && a.platform === p)
  const getStat    = (clientId: string, p: Platform) =>
    stats.find(s => s.client_id === clientId && s.platform === p)

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
    for (const p of ['tiktok', 'instagram', 'youtube'] as Platform[]) {
      if (getAccount(clientId, p)) await refreshPlatform(clientId, p)
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
    for (const p of ['tiktok', 'instagram', 'youtube'] as Platform[]) {
      const handle = handles[p].trim()
      if (handle) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('social_accounts') as any).upsert(
          { client_id: showSettings.id, platform: p, handle },
          { onConflict: 'client_id,platform' }
        )
      } else {
        await supabase.from('social_accounts').delete()
          .eq('client_id', showSettings.id).eq('platform', p)
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

  // Global 30-day totals
  const global30 = clients.reduce((acc, c) => {
    for (const p of ['tiktok', 'instagram', 'youtube'] as Platform[]) {
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
    <div className="flex flex-col h-full bg-[#161616]">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#252525] flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-[#e8e8e8]">Social Media</h1>
          <p className="text-xs text-[#555] mt-0.5">Performance · last 30 days</p>
        </div>
        <select
          value={selectedClient}
          onChange={e => setSelectedClient(e.target.value)}
          className="px-3 py-1.5 rounded-card bg-[#1e1e1e] border border-[#2a2a2a] text-[#888] text-xs focus:outline-none"
        >
          <option value="all">All Clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Global KPI strip */}
      <div className="flex gap-3 px-6 py-3 border-b border-[#252525] bg-[#161616] flex-shrink-0">
        {[
          { label: 'Total Views',    value: formatNum(global30.views),    color: '#4f8ef7', icon: Eye },
          { label: 'Total Likes',    value: formatNum(global30.likes),    color: '#f472b6', icon: Heart },
          { label: 'Total Comments', value: formatNum(global30.comments), color: '#a78bfa', icon: MessageCircle },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="flex items-center gap-3 bg-[#1e1e1e] border border-[#252525] rounded-card px-4 py-2.5 min-w-max">
            <Icon size={15} style={{ color }} />
            <div>
              <p className="text-[10px] text-[#555]">{label}</p>
              <p className="text-base font-bold text-[#e8e8e8]">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Client cards */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {displayedClients.map(client => {
          const platforms: Platform[] = ['tiktok', 'instagram', 'youtube']

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

          return (
            <div key={client.id} className="bg-[#1a1a1a] border border-[#252525] rounded-2xl overflow-hidden">

              {/* Client header */}
              <div className="flex items-center gap-3 px-5 py-4">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: `${client.color}20`, color: client.color }}
                >
                  {client.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[#e8e8e8]">{client.name}</h3>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1 text-xs text-[#666]">
                      <Eye size={10} className="text-[#4f8ef7]" /> {formatNum(combined.views)}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-[#666]">
                      <Heart size={10} className="text-[#f472b6]" /> {formatNum(combined.likes)}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-[#666]">
                      <MessageCircle size={10} className="text-[#a78bfa]" /> {formatNum(combined.comments)}
                    </span>
                    <span className="text-[10px] text-[#444]">{combined.posts} posts · 30 days</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => refreshAllForClient(client.id)} disabled={!!refreshing.startsWith(client.id)}>
                    <RefreshCw size={12} className={refreshing.startsWith(client.id) ? 'animate-spin' : ''} />
                    Refresh All
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openSettings(client)}>
                    <Settings size={12} /> Handles
                  </Button>
                </div>
              </div>

              {/* Platform columns */}
              <div className="grid grid-cols-3 divide-x divide-[#222]">
                {platforms.map(platform => {
                  const account     = getAccount(client.id, platform)
                  const stat        = getStat(client.id, platform)
                  const cfg         = PLATFORM_CONFIG[platform]
                  const isRefreshing = refreshing === `${client.id}-${platform}`
                  const d30         = stat ? get30DayStats(stat) : null

                  return (
                    <div key={platform} className="p-5">

                      {/* Platform header */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-sm font-bold flex-shrink-0"
                            style={{ background: cfg.bg, color: cfg.color }}
                          >
                            {cfg.icon}
                          </span>
                          <div>
                            <p className="text-xs font-semibold text-[#d0d0d0]">{cfg.label}</p>
                            {account && <p className="text-[10px] text-[#555]">{account.handle}</p>}
                          </div>
                        </div>
                        {account && (
                          <button
                            onClick={() => refreshPlatform(client.id, platform)}
                            disabled={isRefreshing}
                            className="p-1 text-[#444] hover:text-[#888] transition-colors"
                          >
                            <RefreshCw size={11} className={isRefreshing ? 'animate-spin' : ''} />
                          </button>
                        )}
                      </div>

                      {!account ? (
                        <p className="text-xs text-[#444] mt-2">No handle set</p>
                      ) : !stat ? (
                        <p className="text-xs text-[#444] mt-2">Hit refresh to load data</p>
                      ) : (
                        <>
                          {/* Followers */}
                          <div className="mb-4">
                            <p className="text-[10px] text-[#555] uppercase tracking-wider mb-0.5">Followers</p>
                            <p className="text-2xl font-bold text-[#e8e8e8] leading-none">{formatNum(stat.followers)}</p>
                          </div>

                          {/* 30-day metrics grid */}
                          <div className="grid grid-cols-2 gap-2.5 mb-4">
                            {[
                              { label: 'Views',    value: d30?.views,    color: '#4f8ef7' },
                              { label: 'Likes',    value: d30?.likes,    color: '#f472b6' },
                              { label: 'Comments', value: d30?.comments, color: '#a78bfa' },
                              { label: 'Posts',    value: d30?.posts,    color: '#888' },
                            ].map(({ label, value, color }) => (
                              <div key={label} className="bg-[#141414] rounded-xl p-2.5">
                                <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color }}>{label}</p>
                                <p className="text-sm font-bold text-[#e8e8e8]">{value !== undefined ? formatNum(value) : '—'}</p>
                              </div>
                            ))}
                          </div>

                          {/* Chart label */}
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <TrendingUp size={10} style={{ color: cfg.color }} />
                            <p className="text-[9px] uppercase tracking-wider text-[#444]">Cumulative reach · 30 days</p>
                          </div>

                          {/* Cumulative reach chart */}
                          <CumulativeChart
                            videos={stat.latest_videos}
                            platform={platform}
                            clientId={client.id}
                          />

                          {/* Recent videos quick list */}
                          {(stat.latest_videos ?? []).length > 0 && (
                            <div className="mt-4 pt-3 border-t border-[#222]">
                              <p className="text-[9px] uppercase tracking-wider text-[#444] mb-2">Top posts · 30 days</p>
                              <div className="space-y-1.5">
                                {(stat.latest_videos ?? [])
                                  .filter(v => {
                                    if (!v.date) return false
                                    const d = new Date(v.date)
                                    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                                    return !isNaN(d.getTime()) && d >= cutoff
                                  })
                                  .sort((a, b) => b.views - a.views)
                                  .slice(0, 3)
                                  .map((v, i) => (
                                    <a
                                      key={i}
                                      href={v.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 group pl-2 py-0.5 rounded-sm"
                                      style={{ borderLeft: `2px solid ${cfg.color}30` }}
                                    >
                                      <span className="text-[10px] text-[#444] w-3 flex-shrink-0">{i + 1}</span>
                                      <p className="text-[10px] text-[#888] group-hover:text-[#ccc] transition-colors flex-1 line-clamp-1 leading-snug">
                                        {v.title || 'Untitled'}
                                      </p>
                                      <span className="text-xs text-[#555] flex-shrink-0">{formatNum(v.views)}</span>
                                      <ExternalLink size={8} className="text-[#333] group-hover:text-[#555] flex-shrink-0" />
                                    </a>
                                  ))}
                              </div>
                            </div>
                          )}

                          <p className="text-[9px] text-[#333] mt-4">
                            Updated {new Date(stat.refreshed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Settings modal */}
      <Modal open={!!showSettings} onClose={() => setShowSettings(null)} title={`${showSettings?.name} — Social Handles`}>
        <div className="space-y-3">
          <p className="text-xs text-[#888]">Enter the handle for each platform.</p>
          <Input label="♪ TikTok Handle"            value={handles.tiktok}    onChange={e => setHandles(p => ({ ...p, tiktok:    e.target.value }))} placeholder="@handle" />
          <Input label="◈ Instagram Handle"          value={handles.instagram} onChange={e => setHandles(p => ({ ...p, instagram: e.target.value }))} placeholder="@handle" />
          <Input label="▶ YouTube Handle / Channel"  value={handles.youtube}   onChange={e => setHandles(p => ({ ...p, youtube:   e.target.value }))} placeholder="Channel Name" />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setShowSettings(null)}>Cancel</Button>
            <Button onClick={saveHandles} disabled={savingHandles}>{savingHandles ? 'Saving…' : 'Save Handles'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
