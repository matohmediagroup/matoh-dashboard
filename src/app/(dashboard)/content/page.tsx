'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, LayoutGrid, Kanban, Check, X, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import type { ContentItem, Client, Profile } from '@/types/database'
import { ContentKanban } from './ContentKanban'

type Tab = 'table' | 'kanban'

export default function ContentPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('kanban')
  const [items, setItems] = useState<ContentItem[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [editors, setEditors] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [userRole, setUserRole] = useState('')
  const [userId, setUserId] = useState('')
  const [filterClient, setFilterClient] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [form, setForm] = useState({
    title: '', client_id: '', filming_status: 'not_filmed',
    edit_status: 'unassigned', assigned_editor_id: '', posted_date: '', caption: '',
  })

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase.from('profiles') as any).select('role').eq('id', user.id).single() as { data: { role: string } | null }
    const role = profile?.role ?? ''
    setUserRole(role)

    const [{ data: itemsData }, { data: clientsData }, { data: editorsData }] = await Promise.all([
      role === 'editor'
        ? supabase.from('content_items').select('*').eq('assigned_editor_id', user.id).order('created_at', { ascending: false })
        : supabase.from('content_items').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('*').order('name'),
      supabase.from('profiles').select('*').eq('role', 'editor').order('full_name'),
    ])

    setItems(itemsData ?? [])
    setClients(clientsData ?? [])
    setEditors(editorsData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]))

  async function addItem() {
    if (!form.title.trim()) return
    setSaving(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('content_items') as any).insert({
      title: form.title.trim(),
      client_id: form.client_id || null,
      filming_status: form.filming_status,
      edit_status: form.edit_status,
      assigned_editor_id: form.assigned_editor_id || null,
      posted_date: form.posted_date || null,
      caption: form.caption || null,
      approval_status: 'pending',
    })
    setSaving(false)
    setShowAdd(false)
    setForm({ title: '', client_id: '', filming_status: 'not_filmed', edit_status: 'unassigned', assigned_editor_id: '', posted_date: '', caption: '' })
    fetchData()
  }

  if (loading) return <PageSpinner />

  const filtered = items.filter(i => {
    if (filterClient !== 'all' && i.client_id !== filterClient) return false
    if (filterStatus !== 'all' && i.edit_status !== filterStatus) return false
    return true
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2e2e2e] flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-[#e8e8e8]">Content Board</h1>
          <p className="text-xs text-[#888] mt-0.5">{items.length} videos tracked</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filters */}
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
            className="px-3 py-1.5 rounded-card bg-[#191919] border border-[#2e2e2e] text-[#888] text-xs focus:outline-none">
            <option value="all">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 rounded-card bg-[#191919] border border-[#2e2e2e] text-[#888] text-xs focus:outline-none">
            <option value="all">All Statuses</option>
            <option value="unassigned">To Film</option>
            <option value="in_progress">To Edit</option>
            <option value="revisions">Revisions</option>
            <option value="done">Done</option>
          </select>
          {/* View toggle */}
          <div className="flex bg-[#191919] border border-[#2e2e2e] rounded-card overflow-hidden">
            <button onClick={() => setTab('table')} className={`px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${tab === 'table' ? 'bg-[#2e2e2e] text-[#e8e8e8]' : 'text-[#888] hover:text-[#e8e8e8]'}`}>
              <LayoutGrid size={12} /> Table
            </button>
            <button onClick={() => setTab('kanban')} className={`px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${tab === 'kanban' ? 'bg-[#2e2e2e] text-[#e8e8e8]' : 'text-[#888] hover:text-[#e8e8e8]'}`}>
              <Kanban size={12} /> Kanban
            </button>
          </div>
          {(userRole === 'owner' || userRole === 'manager') && (
            <Button onClick={() => setShowAdd(true)}><Plus size={14} /> Add Video</Button>
          )}
        </div>
      </div>

      {/* Table view */}
      {tab === 'table' && (
        <div className="flex-1 overflow-auto p-6">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#2e2e2e]">
                <th className="text-left py-2 px-3 text-[10px] font-semibold text-[#888] uppercase tracking-wide">Title</th>
                <th className="text-left py-2 px-3 text-[10px] font-semibold text-[#888] uppercase tracking-wide">Client</th>
                <th className="text-left py-2 px-3 text-[10px] font-semibold text-[#888] uppercase tracking-wide">Filmed</th>
                <th className="text-left py-2 px-3 text-[10px] font-semibold text-[#888] uppercase tracking-wide">Edit Status</th>
                <th className="text-left py-2 px-3 text-[10px] font-semibold text-[#888] uppercase tracking-wide">Editor</th>
                <th className="text-left py-2 px-3 text-[10px] font-semibold text-[#888] uppercase tracking-wide">Approval</th>
                <th className="text-left py-2 px-3 text-[10px] font-semibold text-[#888] uppercase tracking-wide">Post Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const client = item.client_id ? clientMap[item.client_id] : null
                const editor = item.assigned_editor_id ? editors.find(e => e.id === item.assigned_editor_id) : null
                return (
                  <tr key={item.id} className="border-b border-[#2e2e2e] hover:bg-[#252525] transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        {client && <div className="w-1 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: client.color }} />}
                        <span className="text-[#e8e8e8] font-medium">{item.title}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      {client
                        ? <span className="text-xs px-2 py-0.5 rounded-chip font-medium" style={{ backgroundColor: `${client.color}25`, color: client.color }}>{client.name}</span>
                        : <span className="text-[#555] text-xs">—</span>}
                    </td>
                    <td className="py-2.5 px-3">
                      {item.filming_status === 'filmed'
                        ? <span className="flex items-center gap-1 text-[#10b981] text-xs"><Check size={11} /> Filmed</span>
                        : <span className="text-[#888] text-xs">Not filmed</span>}
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusPill status={item.edit_status} />
                    </td>
                    <td className="py-2.5 px-3 text-[#888] text-xs">{editor ? editor.full_name : '—'}</td>
                    <td className="py-2.5 px-3">
                      {item.approval_status === 'approved'
                        ? <span className="flex items-center gap-1 text-[#10b981] text-xs"><Check size={11} /> Approved</span>
                        : item.approval_status === 'rejected'
                        ? <span className="flex items-center gap-1 text-[#ef4444] text-xs"><X size={11} /> Rejected</span>
                        : <span className="text-[#888] text-xs">Pending</span>}
                    </td>
                    <td className="py-2.5 px-3 text-[#888] text-xs">
                      {item.posted_date ? new Date(item.posted_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="py-16 text-center text-[#555] text-sm">No videos found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Kanban view */}
      {tab === 'kanban' && (
        <div className="flex-1 overflow-hidden">
          <ContentKanban
            items={filtered}
            clientMap={clientMap}
            onRefresh={fetchData}
            userRole={userRole}
            userId={userId}
            editors={editors}
          />
        </div>
      )}

      {/* Add modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Video">
        <div className="space-y-3">
          <Input label="Title" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Audi Q5 vs Q7 Comparison" />
          <div>
            <label className="text-xs text-[#888] uppercase tracking-wide block mb-1">Client</label>
            <select value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}
              className="w-full px-3 py-2 rounded-card bg-[#191919] border border-[#2e2e2e] text-[#e8e8e8] text-sm focus:outline-none focus:border-[#4f8ef7]">
              <option value="">No client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
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
          <Input label="Post Date" type="date" value={form.posted_date} onChange={e => setForm(p => ({ ...p, posted_date: e.target.value }))} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={addItem} disabled={saving}>{saving ? 'Saving…' : 'Add Video'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    unassigned: { label: 'To Film', color: '#888' },
    in_progress: { label: 'Editing', color: '#4f8ef7' },
    revisions:   { label: 'Revisions', color: '#f59e0b' },
    done:        { label: 'Done', color: '#10b981' },
  }
  const s = map[status] || { label: status, color: '#888' }
  return <span className="text-xs px-2 py-0.5 rounded-chip font-medium" style={{ backgroundColor: `${s.color}20`, color: s.color }}>{s.label}</span>
}
