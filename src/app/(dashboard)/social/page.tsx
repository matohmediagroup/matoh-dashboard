'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Settings, TrendingUp, Eye, Users, MessageCircle, Heart, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { PageSpinner } from '@/components/ui/Spinner'
import { Badge } from '@/components/ui/Badge'
import type { Client } from '@/types/database'

type Platform = 'tiktok' | 'instagram' | 'youtube' | 'facebook'

interface SocialAccount {
  id: string
  client_id: string
  platform: Platform
  handle: string
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

interface VideoItem {
  title: string
  views: number
  likes: number
  comments: number
  url: string
  thumbnail: string
  date: string
}

const PLATFORM_CONFIG = {
  tiktok:    { label: 'TikTok',    color: '#010101', accent: '#ff0050', icon: '🎵' },
  instagram: { label: 'Instagram', color: '#e1306c', accent: '#e1306c', icon: '📷' },
  youtube:   { label: 'YouTube',   color: '#ff0000', accent: '#ff0000', icon: '▶️' },
  facebook:  { label: 'Facebook',  color: '#1877f2', accent: '#1877f2', icon: '👤' },
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function calcMTD(videos: VideoItem[], field: 'views' | 'likes'): number {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  return (videos ?? [])
    .filter(v => v.date && new Date(v.date) >= startOfMonth)
    .reduce((sum, v) => sum + (v[field] || 0), 0)
}

export default function SocialPage() {
  const supabase = createClient()
  const [clients, setClients] = useState<Client[]>([])
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [stats, setStats] = useState<SocialStats[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState<string>('') // "clientId-platform"
  const [expanded, setExpanded] = useState<string | null>(null) // "clientId"
  const [showSettings, setShowSettings] = useState<Client | null>(null)
  const [handles, setHandles] = useState({ tiktok: '', instagram: '', youtube: '', facebook: '' })
  const [savingHandles, setSavingHandles] = useState(false)
  const [selectedClient, setSelectedClient] = useState<string>('all')

  const fetchData = useCallback(async () => {
    const [{ data: clientsData }, { data: accountsData }, { data: statsData }] = await Promise.all([
      supabase.from('clients').select('*').eq('status', 'active').order('name'),
      supabase.from('social_accounts').select('*'),
      supabase.from('social_stats').select('*'),
    ])
    const EXCLUDED_KEYWORDS = ['cdf', 'legends', 'phillips']
    setClients((clientsData ?? []).filter(c =>
      !EXCLUDED_KEYWORDS.some(kw => c.name.toLowerCase().includes(kw))
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
    } finally {
      setRefreshing('')
    }
  }

  async function refreshAllForClient(clientId: string) {
    for (const platform of ['tiktok', 'instagram', 'youtube', 'facebook'] as Platform[]) {
      if (getAccount(clientId, platform)) {
        await refreshPlatform(clientId, platform)
      }
    }
  }

  function openSettings(client: Client) {
    const tt = getAccount(client.id, 'tiktok')
    const ig = getAccount(client.id, 'instagram')
    const yt = getAccount(client.id, 'youtube')
    const fb = getAccount(client.id, 'facebook')
    setHandles({
      tiktok: tt?.handle ?? '',
      instagram: ig?.handle ?? '',
      youtube: yt?.handle ?? '',
      facebook: fb?.handle ?? '',
    })
    setShowSettings(client)
  }

  async function saveHandles() {
    if (!showSettings) return
    setSavingHandles(true)
    const clientId = showSettings.id

    for (const platform of ['tiktok', 'instagram', 'youtube', 'facebook'] as Platform[]) {
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

  // Aggregate totals across all clients
  const totalFollowers = (['tiktok', 'instagram', 'youtube', 'facebook'] as Platform[]).reduce((sum, p) => {
    return sum + clients.reduce((s, c) => s + (getStat(c.id, p)?.followers ?? 0), 0)
  }, 0)
  const totalAvgViews = stats.reduce((s, st) => s + st.avg_views, 0)
  const totalPosts = stats.reduce((s, st) => s + st.post_count, 0)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2e2e2e] flex-shrink-0">
        <h1 className="text-xl font-semibold text-[#e8e8e8]">Social Media</h1>
        <div className="flex items-center gap-2">
          <select
            value={selectedClient}
            onChange={e => setSelectedClient(e.target.value)}
            className="px-3 py-1.5 rounded-card bg-[#191919] border border-[#2e2e2e] text-[#888] text-xs focus:outline-none"
          >
            <option value="all">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* KPI strip */}
      <div className="flex gap-4 px-6 py-3 border-b border-[#2e2e2e] bg-[#191919] flex-shrink-0 overflow-x-auto">
        {[
          { label: 'Total Followers', value: formatNum(totalFollowers), icon: Users },
          { label: 'Avg Views/Video', value: formatNum(totalAvgViews), icon: Eye },
          { label: 'Total Posts', value: formatNum(totalPosts), icon: TrendingUp },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="flex items-center gap-3 bg-[#202020] border border-[#2e2e2e] rounded-card px-4 py-2.5 min-w-max">
            <Icon size={16} className="text-[#4f8ef7]" />
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
          const platforms: Platform[] = ['tiktok', 'instagram', 'youtube', 'facebook']

          return (
            <div key={client.id} className="bg-[#202020] border border-[#2e2e2e] rounded-card overflow-hidden">
              {/* Client header */}
              <div className="flex items-center gap-3 p-4 border-b border-[#2e2e2e]">
                <div className="w-8 h-8 rounded-card flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: `${client.color}22`, color: client.color }}>
                  {client.name.charAt(0)}
                </div>
                <h3 className="text-sm font-semibold text-[#e8e8e8] flex-1">{client.name}</h3>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => refreshAllForClient(client.id)}>
                    <RefreshCw size={12} className={refreshing.startsWith(client.id) ? 'animate-spin' : ''} />
                    Refresh All
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openSettings(client)}>
                    <Settings size={12} /> Handles
                  </Button>
                  <button
                    onClick={() => setExpanded(isExpanded ? null : client.id)}
                    className="p-1.5 rounded-card text-[#888] hover:text-[#e8e8e8] hover:bg-[#252525]"
                  >
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>

              {/* Platform stat cards */}
              <div className="grid grid-cols-3 divide-x divide-[#2e2e2e]">
                {platforms.map(platform => {
                  const account = getAccount(client.id, platform)
                  const stat = getStat(client.id, platform)
                  const config = PLATFORM_CONFIG[platform]
                  const isRefreshing = refreshing === `${client.id}-${platform}`

                  return (
                    <div key={platform} className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{config.icon}</span>
                          <span className="text-xs font-medium text-[#888]">{config.label}</span>
                          {account && <span className="text-[10px] text-[#555]">{account.handle}</span>}
                        </div>
                        {account && (
                          <button
                            onClick={() => refreshPlatform(client.id, platform)}
                            disabled={isRefreshing}
                            className="p-1 rounded-chip text-[#555] hover:text-[#888] transition-colors"
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
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                            <div>
                              <p className="text-[10px] text-[#888]">Followers</p>
                              <p className="text-sm font-semibold text-[#e8e8e8]">{formatNum(stat.followers)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-[#888]">Avg Views</p>
                              <p className="text-sm font-semibold text-[#e8e8e8]">{formatNum(stat.avg_views)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-[#888]">Total Views</p>
                              <p className="text-sm font-medium text-[#e8e8e8]">{formatNum(stat.total_views)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-[#4f8ef7]">Views MTD</p>
                              <p className="text-sm font-medium text-[#4f8ef7]">{formatNum(calcMTD(stat.latest_videos, 'views'))}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-[#888]">Total Likes</p>
                              <p className="text-sm font-medium text-[#e8e8e8]">{formatNum(stat.total_likes ?? (stat.latest_videos ?? []).reduce((s, v) => s + v.likes, 0))}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-[#4f8ef7]">Likes MTD</p>
                              <p className="text-sm font-medium text-[#4f8ef7]">{formatNum(calcMTD(stat.latest_videos, 'likes'))}</p>
                            </div>
                          </div>
                          <p className="text-[10px] text-[#555]">
                            Updated {new Date(stat.refreshed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Expanded: latest videos */}
              {isExpanded && (
                <div className="border-t border-[#2e2e2e] p-4">
                  <h4 className="text-xs font-semibold text-[#888] uppercase tracking-wide mb-3">Recent Videos</h4>
                  <div className="space-y-4">
                    {platforms.map(platform => {
                      const stat = getStat(client.id, platform)
                      const config = PLATFORM_CONFIG[platform]
                      if (!stat?.latest_videos?.length) return null

                      return (
                        <div key={platform}>
                          <p className="text-xs text-[#888] mb-2 flex items-center gap-1.5">
                            <span>{config.icon}</span> {config.label}
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                            {stat.latest_videos.slice(0, 8).map((video, i) => (
                              <a
                                key={i}
                                href={video.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-[#191919] border border-[#2e2e2e] rounded-card p-3 hover:border-[#3a3a3a] transition-colors group block"
                              >
                                {video.thumbnail && (
                                  <img
                                    src={video.thumbnail}
                                    alt={video.title}
                                    className="w-full h-20 object-cover rounded-chip mb-2"
                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                                  />
                                )}
                                <p className="text-xs text-[#e8e8e8] line-clamp-2 mb-2 leading-snug group-hover:text-[#4f8ef7] transition-colors">{video.title || 'Untitled'}</p>
                                <div className="flex items-center gap-2 text-[10px] text-[#888]">
                                  <span className="flex items-center gap-0.5"><Eye size={9} /> {formatNum(video.views)}</span>
                                  <span className="flex items-center gap-0.5"><Heart size={9} /> {formatNum(video.likes)}</span>
                                  <span className="flex items-center gap-0.5"><MessageCircle size={9} /> {formatNum(video.comments)}</span>
                                </div>
                              </a>
                            ))}
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
          <p className="text-xs text-[#888]">Enter the handle/username for each platform. Use @username format or channel name.</p>
          <Input
            label="🎵 TikTok Handle"
            value={handles.tiktok}
            onChange={e => setHandles(p => ({ ...p, tiktok: e.target.value }))}
            placeholder="@vwpacific"
          />
          <Input
            label="📷 Instagram Handle"
            value={handles.instagram}
            onChange={e => setHandles(p => ({ ...p, instagram: e.target.value }))}
            placeholder="@vwpacific"
          />
          <Input
            label="▶️ YouTube Handle/Channel"
            value={handles.youtube}
            onChange={e => setHandles(p => ({ ...p, youtube: e.target.value }))}
            placeholder="Volkswagen Pacific"
          />
          <Input
            label="👤 Facebook Page"
            value={handles.facebook}
            onChange={e => setHandles(p => ({ ...p, facebook: e.target.value }))}
            placeholder="VWPacific"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setShowSettings(null)}>Cancel</Button>
            <Button onClick={saveHandles} disabled={savingHandles}>
              {savingHandles ? 'Saving…' : 'Save Handles'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
