'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { AlertTriangle, Clock, MapPin, Users, Video } from 'lucide-react'
import Link from 'next/link'

interface Profile {
  id: string
  full_name: string
  role: string
}

interface OwnerDashboardProps {
  profile: Profile
}

interface MissedPost {
  id: string
  clientName: string
  postDate: string
}

interface OverdueTask {
  id: string
  title: string
  dueDate: string
  assignedName?: string
}

interface BehindClient {
  id: string
  name: string
  color: string
  posted: number
  target: number
  scheduled: number
}

interface PipelineCount {
  unassigned: number
  in_progress: number
  revisions: number
  done: number
  filmed: number
}

interface EditorWorkload {
  id: string
  name: string
  count: number
}

interface Shoot {
  id: string
  shoot_date: string
  shoot_time?: string
  location?: string
  clients?: { name: string; color: string }
}

interface ContentItem {
  id: string
  title: string
  posted_date?: string
  edit_status: string
  clients?: { name: string; color: string }
}

interface DashboardData {
  revenueMTD: number
  contentPostedMTD: number
  activeClientsCount: number
  outstandingTotal: number
  missedPosts: MissedPost[]
  overdueTasks: OverdueTask[]
  behindClients: BehindClient[]
  pipeline: PipelineCount
  editorWorkloads: EditorWorkload[]
  unassignedCount: number
  upcomingShoots: Shoot[]
  contentDue: ContentItem[]
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

export function OwnerDashboard({ profile }: OwnerDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const now = new Date()
      const today = now.toISOString().split('T')[0]
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
      const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      const [
        { data: paidInvoices },
        { data: postedMTD },
        { data: activeClients },
        { data: outstandingInvoices },
        // Needs Attention
        { data: missedPostSlots },
        { data: overdueTasksRaw },
        // Pipeline
        { data: allContentItems },
        // Editor workload
        { data: editors },
        // Shoots + content due
        { data: upcomingShoots },
        { data: contentDue },
        // Post schedule this month (for behind-target calc)
        { data: scheduleThisMonth },
      ] = await Promise.all([
        (supabase.from('invoices') as any).select('amount').eq('status', 'paid').gte('created_at', startOfMonth),
        (supabase.from('content_items') as any).select('id').eq('edit_status', 'done').gte('updated_at', startOfMonth),
        (supabase.from('clients') as any).select('id, name, color, monthly_target, status').eq('status', 'active'),
        (supabase.from('invoices') as any).select('amount').neq('status', 'paid'),
        // Missed posts: post_schedule slots where post_date < today and status != 'posted'
        (supabase.from('post_schedule') as any)
          .select('id, post_date, clients(name, color)')
          .lt('post_date', today)
          .neq('status', 'posted')
          .order('post_date', { ascending: false })
          .limit(20),
        // Overdue tasks
        (supabase.from('tasks') as any)
          .select('id, title, due_date, profiles(full_name)')
          .lt('due_date', today)
          .neq('status', 'done')
          .order('due_date')
          .limit(20),
        // All content items for pipeline bar + editor workload
        (supabase.from('content_items') as any)
          .select('id, edit_status, filming_status, assigned_editor_id'),
        // Editors for workload section
        (supabase.from('profiles') as any)
          .select('id, full_name')
          .eq('role', 'editor'),
        // Upcoming shoots
        (supabase.from('shoots') as any)
          .select('*, clients(name, color)')
          .gte('shoot_date', today)
          .lte('shoot_date', in7)
          .order('shoot_date')
          .limit(5),
        // Content due this week
        (supabase.from('content_items') as any)
          .select('*, clients(name, color)')
          .lte('posted_date', in7)
          .gte('posted_date', today)
          .neq('edit_status', 'done')
          .order('posted_date')
          .limit(8),
        // Post schedule this month (for behind-target)
        (supabase.from('post_schedule') as any)
          .select('client_id, status, post_date')
          .gte('post_date', startOfMonth.split('T')[0])
          .lte('post_date', endOfMonth),
      ])

      // ── KPIs ──
      const revenueMTD = (paidInvoices ?? []).reduce((s: number, i: any) => s + (i.amount ?? 0), 0)
      const outstandingTotal = (outstandingInvoices ?? []).reduce((s: number, i: any) => s + (i.amount ?? 0), 0)

      // ── Missed posts ──
      const missedPosts: MissedPost[] = (missedPostSlots ?? []).map((slot: any) => ({
        id: slot.id,
        clientName: slot.clients?.name ?? 'Unknown Client',
        postDate: slot.post_date,
      }))

      // ── Overdue tasks ──
      const overdueTasks: OverdueTask[] = (overdueTasksRaw ?? []).map((t: any) => ({
        id: t.id,
        title: t.title,
        dueDate: t.due_date,
        assignedName: t.profiles?.full_name,
      }))

      // ── Behind-target clients ──
      const behindClients: BehindClient[] = []
      for (const client of (activeClients ?? []) as any[]) {
        if (!client.monthly_target || client.monthly_target <= 0) continue
        const slots = (scheduleThisMonth ?? []).filter((s: any) => s.client_id === client.id)
        const posted = slots.filter((s: any) => s.status === 'posted').length
        const scheduled = slots.filter((s: any) => s.status !== 'posted').length
        // Flag if posted + remaining scheduled < target
        if (posted + scheduled < client.monthly_target) {
          behindClients.push({
            id: client.id,
            name: client.name,
            color: client.color,
            posted,
            target: client.monthly_target,
            scheduled,
          })
        }
      }

      // ── Pipeline ──
      const items = (allContentItems ?? []) as any[]
      const pipeline: PipelineCount = {
        unassigned: items.filter(i => i.edit_status === 'unassigned').length,
        in_progress: items.filter(i => i.edit_status === 'in_progress').length,
        revisions: items.filter(i => i.edit_status === 'revisions').length,
        done: items.filter(i => i.edit_status === 'done').length,
        filmed: items.filter(i => i.filming_status === 'filmed' && i.edit_status !== 'done').length,
      }

      // ── Editor workloads ──
      const editorWorkloads: EditorWorkload[] = (editors ?? []).map((e: any) => ({
        id: e.id,
        name: e.full_name,
        count: items.filter(i => i.assigned_editor_id === e.id && i.filming_status !== 'filmed').length,
      }))
      const unassignedCount = items.filter(i => !i.assigned_editor_id && i.filming_status !== 'filmed').length

      setData({
        revenueMTD,
        contentPostedMTD: postedMTD?.length ?? 0,
        activeClientsCount: activeClients?.length ?? 0,
        outstandingTotal,
        missedPosts,
        overdueTasks,
        behindClients,
        pipeline,
        editorWorkloads,
        unassignedCount,
        upcomingShoots: (upcomingShoots ?? []) as Shoot[],
        contentDue: (contentDue ?? []) as ContentItem[],
      })
      setLoading(false)
    }

    load()
  }, [])

  if (loading) return <PageSpinner />
  if (!data) return null

  const now = new Date()
  const hasAlerts = data.missedPosts.length > 0 || data.overdueTasks.length > 0 || data.behindClients.length > 0

  const kpis = [
    { label: 'Revenue MTD', value: formatCurrency(data.revenueMTD), color: '#10b981' },
    { label: 'Content Posted MTD', value: String(data.contentPostedMTD), color: '#4f8ef7' },
    { label: 'Active Clients', value: String(data.activeClientsCount), color: '#8b5cf6' },
    { label: 'Outstanding', value: formatCurrency(data.outstandingTotal), color: '#f59e0b' },
  ]

  const pipelineTotal =
    data.pipeline.unassigned +
    data.pipeline.in_progress +
    data.pipeline.revisions +
    data.pipeline.done +
    data.pipeline.filmed

  const pipelineSegments = [
    { key: 'unassigned', label: 'Unassigned', count: data.pipeline.unassigned, color: '#555555', bg: '#55555522' },
    { key: 'filmed', label: 'Filmed', count: data.pipeline.filmed, color: '#8b5cf6', bg: '#8b5cf622' },
    { key: 'in_progress', label: 'In Progress', count: data.pipeline.in_progress, color: '#4f8ef7', bg: '#4f8ef722' },
    { key: 'revisions', label: 'Revisions', count: data.pipeline.revisions, color: '#f59e0b', bg: '#f59e0b22' },
    { key: 'done', label: 'Done', count: data.pipeline.done, color: '#10b981', bg: '#10b98122' },
  ]

  const maxEditorCount = Math.max(
    ...data.editorWorkloads.map(e => e.count),
    data.unassignedCount,
    1
  )

  return (
    <div className="p-6 max-w-6xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-[#e8e8e8]">
          Good {getGreeting()}, {profile.full_name.split(' ')[0]}
        </h1>
        <p className="text-sm text-[#888] mt-0.5">
          {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* ── Needs Attention ── */}
      {hasAlerts && (
        <div className="bg-[#1a1212] border border-[#3d2020] rounded-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-[#ef4444]" />
            <h2 className="text-sm font-semibold text-[#ef4444]">Needs Attention</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Missed posts */}
            {data.missedPosts.map(mp => (
              <Link
                key={mp.id}
                href="/schedule"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-chip bg-[#ef4444]/15 border border-[#ef4444]/30 text-[#ef4444] text-xs font-medium hover:bg-[#ef4444]/25 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444] flex-shrink-0" />
                Missed post · {mp.clientName} · {new Date(mp.postDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Link>
            ))}

            {/* Overdue tasks */}
            {data.overdueTasks.length > 0 && (
              <Link
                href="/todos"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-chip bg-[#f59e0b]/15 border border-[#f59e0b]/30 text-[#f59e0b] text-xs font-medium hover:bg-[#f59e0b]/25 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] flex-shrink-0" />
                {data.overdueTasks.length} overdue task{data.overdueTasks.length !== 1 ? 's' : ''}
                {data.overdueTasks.length <= 3 && (
                  <span className="text-[#f59e0b]/70">
                    {' '}· {data.overdueTasks.map(t => t.title).join(', ')}
                  </span>
                )}
              </Link>
            )}

            {/* Behind-target clients */}
            {data.behindClients.map(bc => (
              <Link
                key={bc.id}
                href={`/clients/${bc.id}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-chip bg-[#f59e0b]/15 border border-[#f59e0b]/30 text-[#f59e0b] text-xs font-medium hover:bg-[#f59e0b]/25 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: bc.color }} />
                {bc.name} behind target · {bc.posted + bc.scheduled}/{bc.target} slots
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(kpi => (
          <div key={kpi.label} className="bg-[#202020] border border-[#2e2e2e] rounded-card p-4">
            <p className="text-xs text-[#888] mb-1">{kpi.label}</p>
            <p className="text-2xl font-semibold" style={{ color: kpi.color }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* ── Pipeline Health Bar ── */}
      <div className="bg-[#202020] border border-[#2e2e2e] rounded-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#e8e8e8]">Pipeline Health</h2>
          <span className="text-xs text-[#888]">{pipelineTotal} total videos</span>
        </div>

        {/* Segmented bar */}
        {pipelineTotal > 0 ? (
          <div className="h-3 flex rounded-full overflow-hidden gap-px">
            {pipelineSegments.map(seg =>
              seg.count > 0 ? (
                <div
                  key={seg.key}
                  title={`${seg.label}: ${seg.count}`}
                  className="h-full transition-all"
                  style={{
                    width: `${(seg.count / pipelineTotal) * 100}%`,
                    backgroundColor: seg.color,
                  }}
                />
              ) : null
            )}
          </div>
        ) : (
          <div className="h-3 bg-[#2e2e2e] rounded-full" />
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-3">
          {pipelineSegments.map(seg => (
            <div key={seg.key} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-xs text-[#888]">{seg.label}</span>
              <span className="text-xs font-semibold text-[#e8e8e8]">{seg.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom 3-col grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Upcoming shoots */}
        <div className="bg-[#202020] border border-[#2e2e2e] rounded-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#e8e8e8]">Shoots This Week</h2>
            <Link href="/videographer" className="text-xs text-[#888] hover:text-[#4f8ef7]">View all →</Link>
          </div>
          {!data.upcomingShoots.length ? (
            <p className="text-xs text-[#555]">No shoots this week.</p>
          ) : (
            <div className="space-y-2">
              {data.upcomingShoots.map(s => (
                <div key={s.id} className="flex gap-2 p-2 border border-[#2e2e2e] rounded-card">
                  {s.clients && (
                    <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: s.clients.color }} />
                  )}
                  <div>
                    <p className="text-xs font-medium text-[#e8e8e8]">{s.clients?.name ?? 'Shoot'}</p>
                    <p className="text-[10px] text-[#888] flex items-center gap-1 mt-0.5">
                      <Clock size={9} />
                      {new Date(s.shoot_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {s.shoot_time && ` · ${s.shoot_time.slice(0, 5)}`}
                    </p>
                    {s.location && (
                      <p className="text-[10px] text-[#555] flex items-center gap-1">
                        <MapPin size={9} />
                        {s.location}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Content due this week */}
        <div className="bg-[#202020] border border-[#2e2e2e] rounded-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#e8e8e8]">Content Due This Week</h2>
            <Link href="/content" className="text-xs text-[#888] hover:text-[#4f8ef7]">View all →</Link>
          </div>
          {!data.contentDue.length ? (
            <p className="text-xs text-[#555]">Nothing due this week.</p>
          ) : (
            <div className="space-y-2">
              {data.contentDue.map(item => (
                <div key={item.id} className="flex items-center gap-2 p-2 border border-[#2e2e2e] rounded-card">
                  {item.clients && (
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.clients.color }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#e8e8e8] truncate">{item.title}</p>
                    <p className="text-[10px] text-[#888]">
                      {item.posted_date ? formatDate(item.posted_date) : '—'}
                    </p>
                  </div>
                  <Badge variant={item.edit_status as 'unassigned' | 'in_progress' | 'revisions' | 'done'} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Editor workload */}
        <div className="bg-[#202020] border border-[#2e2e2e] rounded-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#e8e8e8]">Editor Workload</h2>
            <Users size={14} className="text-[#555]" />
          </div>
          {data.editorWorkloads.length === 0 ? (
            <p className="text-xs text-[#555]">No editors found.</p>
          ) : (
            <div className="space-y-3">
              {data.editorWorkloads
                .sort((a, b) => b.count - a.count)
                .map(editor => (
                  <div key={editor.id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#e8e8e8] font-medium">{editor.name.split(' ')[0]}</span>
                      <span className="text-xs text-[#888]">
                        {editor.count} video{editor.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="h-1.5 bg-[#2e2e2e] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#4f8ef7] rounded-full transition-all"
                        style={{ width: `${Math.round((editor.count / maxEditorCount) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}

              {/* Unassigned row */}
              <div className="space-y-1 pt-1 border-t border-[#2e2e2e]">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#555] font-medium flex items-center gap-1.5">
                    <Video size={10} />
                    Unassigned
                  </span>
                  <span className="text-xs text-[#555]">
                    {data.unassignedCount} video{data.unassignedCount !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="h-1.5 bg-[#2e2e2e] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#555] rounded-full transition-all"
                    style={{ width: `${Math.round((data.unassignedCount / maxEditorCount) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
