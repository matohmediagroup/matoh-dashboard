'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, LayoutGrid, Kanban, BarChart2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import type { ContentItem, Client, Profile } from '@/types/database'
import { ContentCalendar } from './ContentCalendar'
import { ContentKanban } from './ContentKanban'
import { ContentBarChart } from './ContentBarChart'
import { MetricsStrip } from './MetricsStrip'

type Tab = 'calendar' | 'kanban' | 'chart'

export default function ContentPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('kanban')
  const [items, setItems] = useState<ContentItem[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [editors, setEditors] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [userRole, setUserRole] = useState<string>('')
  const [userId, setUserId] = useState<string>('')
  const [form, setForm] = useState({
    title: '', client_id: '', filming_status: 'not_filmed',
    edit_status: 'unassigned', assigned_editor_id: '', posted_date: '', caption: '',
  })

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const role = profile?.role ?? ''
    setUserRole(role)

    const [{ data: itemsData }, { data: clientsData }, { data: editorsData }] = await Promise.all([
      role === 'editor'
        ? supabase.from('content_items').select('*').eq('assigned_editor_id', user.id).order('posted_date')
        : supabase.from('content_items').select('*').order('posted_date'),
      supabase.from('clients').select('*').order('name'),
      supabase.from('profiles').select('*').eq('role', 'editor').order('full_name'),
    ])

    setItems(itemsData ?? [])
    setClients(clientsData ?? [])
    setEditors(editorsData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    // Realtime subscription
    const channel = supabase.channel('content_items_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_items' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchData])

  async function addItem() {
    if (!form.title.trim()) return
    setSaving(true)
    await supabase.from('content_items').insert({
      title: form.title,
      client_id: form.client_id || null,
      filming_status: form.filming_status as 'not_filmed' | 'filmed',
      edit_status: form.edit_status as 'unassigned' | 'in_progress' | 'revisions' | 'done',
      assigned_editor_id: form.assigned_editor_id || null,
      posted_date: form.posted_date || null,
      caption: form.caption || null,
    })
    setSaving(false)
    setShowAdd(false)
    setForm({ title: '', client_id: '', filming_status: 'not_filmed', edit_status: 'unassigned', assigned_editor_id: '', posted_date: '', caption: '' })
    fetchData()
  }

  if (loading) return <PageSpinner />

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]))

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2e2e2e] flex-shrink-0">
        <h1 className="text-xl font-semibold text-[#e8e8e8]">Content Schedule</h1>
        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div className="flex bg-[#191919] border border-[#2e2e2e] rounded-card p-0.5">
            {([
              { id: 'kanban', icon: Kanban, label: 'Kanban' },
              { id: 'calendar', icon: LayoutGrid, label: 'Calendar' },
              { id: 'chart', icon: BarChart2, label: 'Chart' },
            ] as const).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-chip text-xs font-medium transition-colors ${tab === id ? 'bg-[#202020] text-[#e8e8e8]' : 'text-[#888] hover:text-[#e8e8e8]'}`}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
          {(userRole === 'owner' || userRole === 'manager') && (
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus size={14} /> Add
            </Button>
          )}
        </div>
      </div>

      {/* Metrics strip */}
      <MetricsStrip items={items} clients={clients} editors={editors} />

      {/* Views */}
      <div className="flex-1 overflow-hidden">
        {tab === 'calendar' && <ContentCalendar items={items} clientMap={clientMap} onRefresh={fetchData} userRole={userRole} editors={editors} />}
        {tab === 'kanban' && <ContentKanban items={items} clientMap={clientMap} onRefresh={fetchData} userRole={userRole} userId={userId} editors={editors} />}
        {tab === 'chart' && <ContentBarChart items={items} clients={clients} />}
      </div>

      {/* Add Item Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Content Item" width="lg">
        <div className="space-y-3">
          <Input label="Title *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Video title" />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Client" value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}>
              <option value="">No client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Input label="Post Date" type="date" value={form.posted_date} onChange={e => setForm(p => ({ ...p, posted_date: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Filming Status" value={form.filming_status} onChange={e => setForm(p => ({ ...p, filming_status: e.target.value }))}>
              <option value="not_filmed">Not Filmed</option>
              <option value="filmed">Filmed</option>
            </Select>
            <Select label="Edit Status" value={form.edit_status} onChange={e => setForm(p => ({ ...p, edit_status: e.target.value }))}>
              <option value="unassigned">Unassigned</option>
              <option value="in_progress">In Progress</option>
              <option value="revisions">Revisions</option>
              <option value="done">Done</option>
            </Select>
          </div>
          <Select label="Assign Editor" value={form.assigned_editor_id} onChange={e => setForm(p => ({ ...p, assigned_editor_id: e.target.value }))}>
            <option value="">Unassigned</option>
            {editors.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </Select>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={addItem} disabled={saving || !form.title.trim()}>
              {saving ? 'Saving…' : 'Add Item'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
