import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { MapPin, Clock, CheckCircle2, Video } from 'lucide-react'
import Link from 'next/link'
import { OwnerDashboard } from './OwnerDashboard'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const role = profile.role
  const now = new Date()
  const today = now.toISOString().split('T')[0]

  // ── Owner / Manager view ──────────────────────────────────────────
  if (role === 'owner' || role === 'manager') {
    return <OwnerDashboard profile={{ id: profile.id, full_name: profile.full_name, role: profile.role }} />
  }

  // ── Editor view ────────────────────────────────────────────────────
  if (role === 'editor') {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const [{ data: myQueue }, { data: completedThisWeek }] = await Promise.all([
      supabase.from('content_items').select('*, clients(name, color)').eq('assigned_editor_id', user.id)
        .in('edit_status', ['in_progress', 'revisions']).order('posted_date'),
      supabase.from('content_items').select('id').eq('assigned_editor_id', user.id)
        .eq('edit_status', 'done').gte('updated_at', weekAgo),
    ])

    return (
      <div className="p-6 max-w-3xl">
        <h1 className="text-2xl font-semibold text-[#e8e8e8] mb-1">Hey {profile.full_name.split(' ')[0]}</h1>
        <p className="text-sm text-[#888] mb-8">Here's your editing queue.</p>

        <div className="flex items-center gap-4 mb-6">
          <div className="bg-[#202020] border border-[#2e2e2e] rounded-card p-4 flex items-center gap-3">
            <CheckCircle2 size={20} className="text-[#10b981]" />
            <div>
              <p className="text-xs text-[#888]">Completed this week</p>
              <p className="text-xl font-semibold text-[#10b981]">{completedThisWeek?.length ?? 0}</p>
            </div>
          </div>
          <div className="bg-[#202020] border border-[#2e2e2e] rounded-card p-4 flex items-center gap-3">
            <Video size={20} className="text-[#4f8ef7]" />
            <div>
              <p className="text-xs text-[#888]">In queue</p>
              <p className="text-xl font-semibold text-[#4f8ef7]">{myQueue?.length ?? 0}</p>
            </div>
          </div>
        </div>

        <h2 className="text-sm font-semibold text-[#888] uppercase tracking-wide mb-3">My Queue</h2>
        {!myQueue?.length ? (
          <p className="text-sm text-[#555]">Your queue is empty.</p>
        ) : (
          <div className="space-y-2">
            {(myQueue as any[]).map((item: any) => (
              <div key={item.id} className="bg-[#202020] border border-[#2e2e2e] rounded-card p-4 flex items-center gap-3">
                {item.clients && <div className="w-1 self-stretch rounded-full" style={{ backgroundColor: item.clients.color }} />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#e8e8e8]">{item.title}</p>
                  <p className="text-xs text-[#888] mt-0.5">{item.clients?.name} · Due {item.posted_date ? formatDate(item.posted_date) : '—'}</p>
                </div>
                <Badge variant={item.edit_status as 'in_progress' | 'revisions'} />
              </div>
            ))}
          </div>
        )}
        <div className="mt-4">
          <Link href="/content" className="text-sm text-[#4f8ef7] hover:underline">View full content schedule →</Link>
        </div>
      </div>
    )
  }

  // ── Videographer view ──────────────────────────────────────────────
  if (role === 'videographer') {
    const [{ data: upcomingShoots }, { data: unfilmedScripts }] = await Promise.all([
      supabase.from('shoots').select('*, clients(name, color)').gte('shoot_date', today).order('shoot_date').limit(5),
      supabase.from('scripts').select('*, clients(name, color)').neq('status', 'fully_filmed').order('created_at', { ascending: false }),
    ])

    return (
      <div className="p-6 max-w-3xl">
        <h1 className="text-2xl font-semibold text-[#e8e8e8] mb-8">Hey {profile.full_name.split(' ')[0]}</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#202020] border border-[#2e2e2e] rounded-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[#e8e8e8]">Upcoming Shoots</h2>
              <Link href="/videographer" className="text-xs text-[#888] hover:text-[#4f8ef7]">All →</Link>
            </div>
            {!upcomingShoots?.length ? <p className="text-xs text-[#555]">No upcoming shoots.</p> : (
              <div className="space-y-2">
                {(upcomingShoots as any[]).map((s: any) => (
                  <div key={s.id} className="flex gap-2">
                    {s.clients && <div className="w-1 self-stretch rounded-full" style={{ backgroundColor: s.clients.color }} />}
                    <div>
                      <p className="text-xs font-medium text-[#e8e8e8]">{s.clients?.name ?? 'Shoot'}</p>
                      <p className="text-[10px] text-[#888]">{new Date(s.shoot_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-[#202020] border border-[#2e2e2e] rounded-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[#e8e8e8]">Scripts To Film</h2>
              <Link href="/videographer/scripts" className="text-xs text-[#888] hover:text-[#4f8ef7]">All →</Link>
            </div>
            {!unfilmedScripts?.length ? <p className="text-xs text-[#555]">All scripts filmed!</p> : (
              <div className="space-y-2">
                {(unfilmedScripts as any[]).map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between p-2 border border-[#2e2e2e] rounded-card">
                    <div>
                      <p className="text-xs font-medium text-[#e8e8e8]">{s.title}</p>
                      <p className="text-[10px] text-[#888]">{s.clients?.name}</p>
                    </div>
                    <Badge variant={s.status === 'partially_filmed' ? 'partially_filmed' : 'not_filmed_script'} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Researcher view ────────────────────────────────────────────────
  const { data: myTasks } = await supabase.from('tasks').select('*').eq('assigned_to', user.id).order('due_date', { nullsFirst: false })

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold text-[#e8e8e8] mb-8">Hey {profile.full_name.split(' ')[0]}</h1>
      <h2 className="text-sm font-semibold text-[#888] uppercase tracking-wide mb-3">My Tasks</h2>
      {!myTasks?.length ? (
        <p className="text-sm text-[#555]">No tasks assigned.</p>
      ) : (
        <div className="space-y-2">
          {myTasks.map(task => (
            <div key={task.id} className={`bg-[#202020] border border-[#2e2e2e] rounded-card p-4 flex items-center gap-3 ${task.status === 'done' ? 'opacity-60' : ''}`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${task.status === 'done' ? 'bg-[#10b981]' : task.status === 'in_progress' ? 'bg-[#4f8ef7]' : 'bg-[#888]'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${task.status === 'done' ? 'line-through text-[#555]' : 'text-[#e8e8e8]'}`}>{task.title}</p>
                {task.due_date && <p className="text-xs text-[#888] mt-0.5">Due {formatDate(task.due_date)}</p>}
              </div>
              <Badge variant={task.status as 'todo' | 'in_progress' | 'done'} label={task.status === 'in_progress' ? 'In Progress' : task.status === 'todo' ? 'To Do' : 'Done'} />
            </div>
          ))}
        </div>
      )}
      <div className="mt-4">
        <Link href="/todos" className="text-sm text-[#4f8ef7] hover:underline">Go to todos →</Link>
      </div>
    </div>
  )
}
