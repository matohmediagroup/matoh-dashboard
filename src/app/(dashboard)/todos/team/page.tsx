'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Check, Clock, Circle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { logActivity } from '@/lib/activity'
import { formatDate } from '@/lib/utils'
import type { Task, Profile } from '@/types/database'

type TaskWithProfiles = Task & { assignee?: Profile; assigner?: Profile }

export default function TeamTodosPage() {
  const supabase = createClient()
  const [tasks, setTasks] = useState<Task[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMember, setSelectedMember] = useState<string>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentUserId, setCurrentUserId] = useState('')
  const [form, setForm] = useState({ title: '', assigned_to: '', due_date: '', notes: '', status: 'todo' })

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setCurrentUserId(user.id)
    const [{ data: tasksData }, { data: profilesData }] = await Promise.all([
      supabase.from('tasks').select('*').order('due_date', { nullsFirst: false }),
      supabase.from('profiles').select('*').order('full_name'),
    ])
    setTasks(tasksData ?? [])
    setProfiles(profilesData ?? [])
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

  const memberTasks = selectedMember === 'all' ? tasks : tasks.filter(t => t.assigned_to === selectedMember)
  const members = profiles

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'done') return <Check size={14} className="text-[#10b981]" />
    if (status === 'in_progress') return <Clock size={14} className="text-[#4f8ef7]" />
    return <Circle size={14} className="text-[#888]" />
  }

  return (
    <div className="flex h-full">
      {/* Member sidebar */}
      <div className="w-52 border-r border-[#2e2e2e] bg-[#202020] flex-shrink-0 overflow-y-auto">
        <div className="p-3 border-b border-[#2e2e2e]">
          <p className="text-xs font-semibold text-[#888] uppercase tracking-wide">Team</p>
        </div>
        <nav className="p-2 space-y-0.5">
          <button
            onClick={() => setSelectedMember('all')}
            className={`w-full text-left px-3 py-2 rounded-card text-sm transition-colors ${selectedMember === 'all' ? 'bg-[#4f8ef7]/15 text-[#4f8ef7]' : 'text-[#888] hover:text-[#e8e8e8] hover:bg-[#252525]'}`}
          >
            All Members
            <span className="ml-2 text-xs text-[#555]">{tasks.length}</span>
          </button>
          {members.map(p => {
            const count = tasks.filter(t => t.assigned_to === p.id && t.status !== 'done').length
            return (
              <button key={p.id} onClick={() => setSelectedMember(p.id)}
                className={`w-full text-left px-3 py-2 rounded-card text-sm transition-colors flex items-center justify-between ${selectedMember === p.id ? 'bg-[#4f8ef7]/15 text-[#4f8ef7]' : 'text-[#888] hover:text-[#e8e8e8] hover:bg-[#252525]'}`}>
                <span className="truncate">{p.full_name.split(' ')[0]}</span>
                {count > 0 && <span className="text-xs bg-[#2e2e2e] px-1.5 py-0.5 rounded-chip flex-shrink-0">{count}</span>}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-[#e8e8e8]">
            {selectedMember === 'all' ? 'All Tasks' : profileMap[selectedMember]?.full_name}
          </h1>
          <Button onClick={() => { setForm(p => ({ ...p, assigned_to: selectedMember === 'all' ? '' : selectedMember })); setShowAdd(true) }}>
            <Plus size={16} /> Assign Task
          </Button>
        </div>

        {/* Summary stats when viewing all */}
        {selectedMember === 'all' && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: 'To Do', count: tasks.filter(t => t.status === 'todo').length, color: '#888' },
              { label: 'In Progress', count: tasks.filter(t => t.status === 'in_progress').length, color: '#4f8ef7' },
              { label: 'Done', count: tasks.filter(t => t.status === 'done').length, color: '#10b981' },
            ].map(({ label, count, color }) => (
              <div key={label} className="bg-[#202020] border border-[#2e2e2e] rounded-card p-4">
                <p className="text-xs text-[#888] mb-1">{label}</p>
                <p className="text-2xl font-semibold" style={{ color }}>{count}</p>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {memberTasks.length === 0 ? (
            <div className="text-center py-12 text-[#888] text-sm">No tasks.</div>
          ) : memberTasks.map(task => {
            const assignee = profileMap[task.assigned_to]
            return (
              <div key={task.id} className={`bg-[#202020] border border-[#2e2e2e] rounded-card p-4 flex items-start gap-3 ${task.status === 'done' ? 'opacity-60' : ''}`}>
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
                  <p className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-[#555]' : 'text-[#e8e8e8]'}`}>{task.title}</p>
                  {task.notes && <p className="text-xs text-[#888] mt-0.5 truncate">{task.notes}</p>}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Badge variant={task.status as 'todo' | 'in_progress' | 'done'} label={task.status === 'in_progress' ? 'In Progress' : task.status === 'todo' ? 'To Do' : 'Done'} />
                    {selectedMember === 'all' && assignee && (
                      <span className="text-[10px] text-[#888]">→ {assignee.full_name}</span>
                    )}
                    {task.due_date && (
                      <span className={`text-[10px] ${new Date(task.due_date) < new Date() && task.status !== 'done' ? 'text-[#ef4444]' : 'text-[#888]'}`}>
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
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Assign Task">
        <div className="space-y-3">
          <Input label="Task *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="What needs to be done?" />
          <Select label="Assign To *" value={form.assigned_to} onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))}>
            <option value="">Select member…</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
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
            <Button onClick={addTask} disabled={saving || !form.title.trim() || !form.assigned_to}>{saving ? 'Saving…' : 'Assign Task'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
