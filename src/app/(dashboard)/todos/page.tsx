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
import type { Task } from '@/types/database'

type StatusFilter = 'all' | 'todo' | 'in_progress' | 'done'

export default function TodosPage() {
  const supabase = createClient()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', due_date: '', notes: '', status: 'todo' })

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data } = await supabase.from('tasks').select('*').eq('assigned_to', user.id).order('due_date', { nullsFirst: false })
    setTasks(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const channel = supabase.channel('tasks_personal')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `assigned_to=eq.${user.id}` }, fetchData)
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    }
    setup()
  }, [fetchData])

  async function addTask() {
    if (!form.title.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('tasks') as any).insert({
      title: form.title,
      assigned_to: user.id,
      assigned_by: user.id,
      due_date: form.due_date || null,
      notes: form.notes || null,
      status: form.status as 'todo' | 'in_progress' | 'done',
    }).select().single()
    if (data) await logActivity('task_created', `Task "${form.title}" created`, 'task', data.id)
    setSaving(false)
    setShowAdd(false)
    setForm({ title: '', due_date: '', notes: '', status: 'todo' })
    fetchData()
  }

  async function updateStatus(task: Task, status: 'todo' | 'in_progress' | 'done') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('tasks') as any).update({ status }).eq('id', task.id)
    if (status === 'done') await logActivity('task_completed', `Task "${task.title}" completed`, 'task', task.id)
    fetchData()
  }

  if (loading) return <PageSpinner />

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter)
  const counts = { todo: tasks.filter(t => t.status === 'todo').length, in_progress: tasks.filter(t => t.status === 'in_progress').length, done: tasks.filter(t => t.status === 'done').length }

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'done') return <Check size={14} className="text-[#10b981]" />
    if (status === 'in_progress') return <Clock size={14} className="text-[#4f8ef7]" />
    return <Circle size={14} className="text-[#888]" />
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-[#e8e8e8]">My Todos</h1>
        <Button onClick={() => setShowAdd(true)}><Plus size={16} /> Add Task</Button>
      </div>

      {/* Filters */}
      <div className="flex gap-1 mb-5">
        {([
          { id: 'all', label: `All (${tasks.length})` },
          { id: 'todo', label: `To Do (${counts.todo})` },
          { id: 'in_progress', label: `In Progress (${counts.in_progress})` },
          { id: 'done', label: `Done (${counts.done})` },
        ] as const).map(({ id, label }) => (
          <button key={id} onClick={() => setFilter(id)}
            className={`px-3 py-1.5 rounded-card text-xs font-medium transition-colors ${filter === id ? 'bg-[#202020] border border-[#2e2e2e] text-[#e8e8e8]' : 'text-[#888] hover:text-[#e8e8e8]'}`}>
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-[#888] text-sm">
          {filter === 'all' ? 'No tasks yet.' : `No ${filter.replace('_', ' ')} tasks.`}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => (
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
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge variant={task.status as 'todo' | 'in_progress' | 'done'} label={task.status === 'in_progress' ? 'In Progress' : task.status === 'todo' ? 'To Do' : 'Done'} />
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
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Task">
        <div className="space-y-3">
          <Input label="Task *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="What needs to be done?" />
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
            <Button onClick={addTask} disabled={saving || !form.title.trim()}>{saving ? 'Saving…' : 'Add Task'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
