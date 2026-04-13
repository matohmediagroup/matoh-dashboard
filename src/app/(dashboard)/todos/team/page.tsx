'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Check, Clock, Circle, Film, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { logActivity } from '@/lib/activity'
import { formatDate } from '@/lib/utils'
import type { Task, Profile, ContentItem, Client } from '@/types/database'

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  unassigned:  { bg: '#3a3a3a', color: '#888',    label: 'Not Started' },
  in_progress: { bg: '#1e3a5f', color: '#4f8ef7', label: 'In Progress' },
  revisions:   { bg: '#3d2e00', color: '#f59e0b', label: 'Revisions' },
  done:        { bg: '#0d3d2a', color: '#10b981', label: 'Done' },
}

function isOverdue(task: Task): boolean {
  if (!task.due_date || task.status === 'done') return false
  return new Date(task.due_date) < new Date()
}

function sortTasksWithOverdue(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    // Done tasks always last
    if (a.status === 'done' && b.status !== 'done') return 1
    if (a.status !== 'done' && b.status === 'done') return -1
    // Among non-done: overdue first
    const aOverdue = isOverdue(a)
    const bOverdue = isOverdue(b)
    if (aOverdue && !bOverdue) return -1
    if (!aOverdue && bOverdue) return 1
    return 0
  })
}

export default function TeamTodosPage() {
  const supabase = createClient()
  const [tasks, setTasks]         = useState<Task[]>([])
  const [profiles, setProfiles]   = useState<Profile[]>([])
  const [contentItems, setContentItems] = useState<ContentItem[]>([])
  const [clients, setClients]     = useState<Client[]>([])
  const [loading, setLoading]     = useState(true)
  const [selectedMember, setSelectedMember] = useState<string>('all')
  const [showAdd, setShowAdd]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [currentUserId, setCurrentUserId] = useState('')
  const [form, setForm] = useState({ title: '', assigned_to: '', due_date: '', notes: '', status: 'todo' })

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setCurrentUserId(user.id)

    const [{ data: tasksData }, { data: profilesData }, { data: contentData }, { data: clientsData }] = await Promise.all([
      supabase.from('tasks').select('*').order('due_date', { nullsFirst: false }),
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('content_items').select('*').not('assigned_editor_id', 'is', null).neq('edit_status', 'done'),
      supabase.from('clients').select('*'),
    ])
    setTasks(tasksData ?? [])
    setProfiles(profilesData ?? [])
    setContentItems(contentData ?? [])
    setClients(clientsData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    const channel = supabase.channel('tasks_team')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchData])

  const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]))
  const clientMap  = Object.fromEntries(clients.map(c => [c.id, c]))

  async function addTask() {
    if (!form.title.trim() || !form.assigned_to) return
    setSaving(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('tasks') as any).insert({
      title: form.title,
      assigned_to: form.assigned_to,
      assigned_by: currentUserId,
      due_date: form.due_date || null,
      notes: form.notes || null,
      status: form.status as 'todo' | 'in_progress' | 'done',
    }).select().single()
    const assignee = profileMap[form.assigned_to]
    if (data) await logActivity('task_assigned', `Task "${form.title}" assigned to ${assignee?.full_name}`, 'task', data.id)
    setSaving(false)
    setShowAdd(false)
    setForm({ title: '', assigned_to: '', due_date: '', notes: '', status: 'todo' })
    fetchData()
  }

  async function updateStatus(task: Task, status: 'todo' | 'in_progress' | 'done') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('tasks') as any).update({ status }).eq('id', task.id)
    if (status === 'done') await logActivity('task_completed', `Task "${task.title}" completed`, 'task', task.id)
    fetchData()
  }

  if (loading) return <PageSpinner />

  const members = profiles

  // Filter tasks + content for selected member
  const memberTasks = selectedMember === 'all'
    ? tasks
    : tasks.filter(t => t.assigned_to === selectedMember)

  const memberContent = selectedMember === 'all'
    ? contentItems
    : contentItems.filter(c => c.assigned_editor_id === selectedMember)

  // Pending task count per member (for sidebar badges)
  function pendingCount(memberId: string) {
    const taskCount = tasks.filter(t => t.assigned_to === memberId && t.status !== 'done').length
    const contentCount = contentItems.filter(c => c.assigned_editor_id === memberId).length
    return taskCount + contentCount
  }

  // Overdue count per member (for red sidebar badge)
  function overdueCount(memberId: string) {
    return tasks.filter(t => t.assigned_to === memberId && isOverdue(t)).length
  }

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'done') return <Check size={14} className="text-[#10b981]" />
    if (status === 'in_progress') return <Clock size={14} className="text-[#4f8ef7]" />
    return <Circle size={14} className="text-[#888]" />
  }

  const selectedName = selectedMember === 'all' ? 'All Members' : profileMap[selectedMember]?.full_name ?? ''

  return (
    <div className="flex h-full">

      {/* ── Member sidebar ── */}
      <div className="w-52 border-r border-[#2e2e2e] bg-[#1a1a1a] flex-shrink-0 overflow-y-auto">
        <div className="p-3 border-b border-[#2e2e2e]">
          <p className="text-xs font-semibold text-[#555] uppercase tracking-wide">Team</p>
        </div>
        <nav className="p-2 space-y-0.5">
          <button
            onClick={() => setSelectedMember('all')}
            className={`w-full text-left px-3 py-2 rounded-card text-sm transition-colors flex items-center justify-between ${selectedMember === 'all' ? 'bg-[#4f8ef7]/15 text-[#4f8ef7]' : 'text-[#888] hover:text-[#e8e8e8] hover:bg-[#252525]'}`}
          >
            <span>All Members</span>
            <span className="text-xs text-[#555]">{tasks.filter(t => t.status !== 'done').length + contentItems.length}</span>
          </button>
          {members.map(p => {
            const count = pendingCount(p.id)
            const overdue = overdueCount(p.id)
            return (
              <button key={p.id} onClick={() => setSelectedMember(p.id)}
                className={`w-full text-left px-3 py-2 rounded-card text-sm transition-colors flex items-center justify-between ${selectedMember === p.id ? 'bg-[#4f8ef7]/15 text-[#4f8ef7]' : 'text-[#888] hover:text-[#e8e8e8] hover:bg-[#252525]'}`}>
                <div className="min-w-0">
                  <p className="truncate">{p.full_name.split(' ')[0]}</p>
                  <p className="text-[10px] text-[#555] truncate capitalize">{p.role}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                  {overdue > 0 && (
                    <span className="text-[10px] bg-[#3d1a1a] text-[#ef4444] px-1.5 py-0.5 rounded-chip font-medium">{overdue}</span>
                  )}
                  {count > 0 && (
                    <span className="text-[10px] bg-[#2e2e2e] px-1.5 py-0.5 rounded-chip">{count}</span>
                  )}
                </div>
              </button>
            )
          })}
        </nav>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-semibold text-[#e8e8e8]">{selectedName}</h1>
            {selectedMember !== 'all' && profileMap[selectedMember] && (
              <p className="text-xs text-[#555] mt-0.5 capitalize">{profileMap[selectedMember].role}</p>
            )}
          </div>
          <Button onClick={() => { setForm(p => ({ ...p, assigned_to: selectedMember === 'all' ? '' : selectedMember })); setShowAdd(true) }}>
            <Plus size={14} /> Assign Task
          </Button>
        </div>

        {/* ── Summary stats (all members view) ── */}
        {selectedMember === 'all' && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Tasks To Do',    count: tasks.filter(t => t.status === 'todo').length,        color: '#888' },
              { label: 'In Progress',    count: tasks.filter(t => t.status === 'in_progress').length, color: '#4f8ef7' },
              { label: 'Tasks Done',     count: tasks.filter(t => t.status === 'done').length,        color: '#10b981' },
              { label: 'Videos Editing', count: contentItems.length,                                   color: '#a855f7' },
            ].map(({ label, count, color }) => (
              <div key={label} className="bg-[#202020] border border-[#2e2e2e] rounded-card p-4">
                <p className="text-xs text-[#888] mb-1">{label}</p>
                <p className="text-2xl font-semibold" style={{ color }}>{count}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Videos being edited ── */}
        {memberContent.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-semibold text-[#555] uppercase tracking-wide mb-3 flex items-center gap-2">
              <Film size={12} /> Videos in Edit
              <span className="text-[#3a3a3a]">({memberContent.length})</span>
            </h2>
            <div className="space-y-1.5">
              {memberContent.map(item => {
                const client = item.client_id ? clientMap[item.client_id] : null
                const st = STATUS_STYLES[item.edit_status] ?? STATUS_STYLES.unassigned
                const editor = item.assigned_editor_id ? profileMap[item.assigned_editor_id] : null
                return (
                  <div key={item.id} className="bg-[#202020] border border-[#2e2e2e] rounded-card px-4 py-3 flex items-center gap-3">
                    {client && <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: client.color }} />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#e8e8e8] truncate">{item.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {client && <span className="text-[10px] text-[#555]">{client.name}</span>}
                        {item.posted_date && (
                          <span className="text-[10px] text-[#555]">Due {new Date(item.posted_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        )}
                      </div>
                    </div>
                    {selectedMember === 'all' && editor && (
                      <span className="text-xs text-[#555] flex-shrink-0">{editor.full_name.split(' ')[0]}</span>
                    )}
                    <span className="flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded" style={{ backgroundColor: st.bg, color: st.color }}>
                      {st.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Tasks ── */}
        <div>
          <h2 className="text-xs font-semibold text-[#555] uppercase tracking-wide mb-3 flex items-center gap-2">
            <AlertCircle size={12} /> Tasks
            <span className="text-[#3a3a3a]">({memberTasks.filter(t => t.status !== 'done').length} active)</span>
          </h2>

          {memberTasks.length === 0 ? (
            <div className="text-center py-10 text-[#555] text-sm">No tasks assigned.</div>
          ) : (
            <div className="space-y-2">
              {sortTasksWithOverdue(memberTasks).map(task => {
                const assignee = profileMap[task.assigned_to]
                const overdue = isOverdue(task)
                return (
                  <div
                    key={task.id}
                    className={`bg-[#202020] border border-[#2e2e2e] rounded-card p-4 flex items-start gap-3 transition-opacity ${task.status === 'done' ? 'opacity-50' : ''} ${overdue ? 'border-l-2 border-l-[#ef4444] bg-[#1e1515]' : ''}`}
                  >
                    <button
                      onClick={() => {
                        const next = task.status === 'todo' ? 'in_progress' : task.status === 'in_progress' ? 'done' : 'todo'
                        updateStatus(task, next)
                      }}
                      className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-chip border border-[#2e2e2e] flex items-center justify-center hover:border-[#4f8ef7] transition-colors"
                    >
                      <StatusIcon status={task.status} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-[#555]' : overdue ? 'text-[#ef4444]' : 'text-[#e8e8e8]'}`}>{task.title}</p>
                      {task.notes && <p className="text-xs text-[#555] mt-0.5 truncate">{task.notes}</p>}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge variant={task.status as 'todo' | 'in_progress' | 'done'} label={task.status === 'in_progress' ? 'In Progress' : task.status === 'todo' ? 'To Do' : 'Done'} />
                        {overdue && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#3d1a1a] text-[#ef4444]">Overdue</span>
                        )}
                        {selectedMember === 'all' && assignee && (
                          <span className="text-[10px] text-[#555]">→ {assignee.full_name}</span>
                        )}
                        {task.due_date && (
                          <span className={`text-[10px] flex items-center gap-1 ${overdue ? 'text-[#ef4444]' : 'text-[#555]'}`}>
                            {overdue && <AlertCircle size={9} />}
                            Due {formatDate(task.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                    <select
                      value={task.status}
                      onChange={e => updateStatus(task, e.target.value as 'todo' | 'in_progress' | 'done')}
                      className="text-xs bg-[#191919] border border-[#2e2e2e] rounded-chip px-2 py-1 text-[#888] focus:outline-none flex-shrink-0"
                    >
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Add Task modal ── */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Assign Task">
        <div className="space-y-3">
          <Input label="Task *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="What needs to be done?" autoFocus />
          <Select label="Assign To *" value={form.assigned_to} onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))}>
            <option value="">Select member…</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name} ({p.role})</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Due Date" type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
            <Select label="Status" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
            </Select>
          </div>
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={addTask} disabled={saving || !form.title.trim() || !form.assigned_to}>
              {saving ? 'Saving…' : 'Assign Task'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
