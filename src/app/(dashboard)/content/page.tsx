'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, ChevronDown, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import type { ContentItem, Client, Profile } from '@/types/database'

const STATUS_OPTIONS = [
  { value: 'unassigned', label: 'Not Started',  bg: '#3a3a3a', color: '#888' },
  { value: 'in_progress', label: 'In Progress', bg: '#1e3a5f', color: '#4f8ef7' },
  { value: 'revisions',   label: 'Revisions',   bg: '#3d2e00', color: '#f59e0b' },
  { value: 'done',        label: 'Done',         bg: '#0d3d2a', color: '#10b981' },
]

function StatusPill({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const s = STATUS_OPTIONS.find(o => o.value === value) || STATUS_OPTIONS[0]
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
        style={{ backgroundColor: s.bg, color: s.color }}
      >
        {s.label}
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-[#252525] border border-[#3a3a3a] rounded-card shadow-xl overflow-hidden min-w-[120px]">
          {STATUS_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#2e2e2e] transition-colors"
              style={{ color: o.color }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${
        checked ? 'bg-[#10b981] border-[#10b981]' : 'border-[#3a3a3a] hover:border-[#888]'
      }`}
    >
      {checked && (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  )
}

export default function ContentPage() {
  const supabase = createClient()
  const [items, setItems] = useState<ContentItem[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [editors, setEditors] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '', client_id: '', filming_status: 'not_filmed',
    edit_status: 'unassigned', assigned_editor_id: '', posted_date: '',
  })

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase.from('profiles') as any).select('role').eq('id', user.id).single() as { data: { role: string } | null }
    setUserRole(profile?.role ?? '')

    const [{ data: itemsData }, { data: clientsData }, { data: editorsData }] = await Promise.all([
      profile?.role === 'editor'
        ? supabase.from('content_items').select('*').eq('assigned_editor_id', user.id).order('created_at', { ascending: false })
        : supabase.from('content_items').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('*').order('name'),
      supabase.from('profiles').select('*').in('role', ['editor', 'manager', 'owner']).order('full_name'),
    ])

    setItems(itemsData ?? [])
    setClients(clientsData ?? [])
    setEditors(editorsData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function updateItem(id: string, field: string, value: string | null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('content_items') as any).update({ [field]: value }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

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
      approval_status: 'pending',
    })
    setSaving(false)
    setShowAdd(false)
    setForm({ title: '', client_id: '', filming_status: 'not_filmed', edit_status: 'unassigned', assigned_editor_id: '', posted_date: '' })
    fetchData()
  }

  if (loading) return <PageSpinner />

  // Group by client
  const noClient = items.filter(i => !i.client_id)
  const byClient = clients.map(c => ({
    client: c,
    items: items.filter(i => i.client_id === c.id),
  })).filter(g => g.items.length > 0)

  const canEdit = userRole === 'owner' || userRole === 'manager'

  const editorMap = Object.fromEntries(editors.map(e => [e.id, e]))

  function toggleCollapse(id: string) {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function renderGroup(label: string, color: string | null, groupItems: ContentItem[], key: string) {
    const isCollapsed = collapsed[key]
    const postedCount = groupItems.filter(i => i.filming_status === 'filmed').length
    const approvedCount = groupItems.filter(i => i.approval_status === 'approved').length

    return (
      <div key={key} className="mb-1">
        {/* Group header */}
        <button
          onClick={() => toggleCollapse(key)}
          className="w-full flex items-center gap-2 px-4 py-2 hover:bg-[#252525] transition-colors text-left"
        >
          {isCollapsed ? <ChevronRight size={13} className="text-[#888] flex-shrink-0" /> : <ChevronDown size={13} className="text-[#888] flex-shrink-0" />}
          {color && <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />}
          <span className="text-sm font-semibold text-[#e8e8e8]">{label}</span>
          <span className="text-xs text-[#555] ml-1">{groupItems.length} videos</span>
          {postedCount > 0 && <span className="text-[10px] text-[#10b981] ml-1">{postedCount} posted</span>}
          {approvedCount > 0 && <span className="text-[10px] text-[#4f8ef7] ml-1">{approvedCount} approved</span>}
        </button>

        {/* Table */}
        {!isCollapsed && (
          <div className="mx-4 mb-3 border border-[#2e2e2e] rounded-card overflow-hidden">
            {/* Column headers */}
            <div className="grid bg-[#191919] border-b border-[#2e2e2e]" style={{ gridTemplateColumns: '1fr 60px 70px 130px 140px 110px 110px' }}>
              <div className="px-3 py-2 text-[10px] font-semibold text-[#555] uppercase tracking-wide">Title</div>
              <div className="px-2 py-2 text-[10px] font-semibold text-[#555] uppercase tracking-wide text-center">Posted</div>
              <div className="px-2 py-2 text-[10px] font-semibold text-[#555] uppercase tracking-wide text-center">Approved</div>
              <div className="px-3 py-2 text-[10px] font-semibold text-[#555] uppercase tracking-wide">Status</div>
              <div className="px-3 py-2 text-[10px] font-semibold text-[#555] uppercase tracking-wide">Editor</div>
              <div className="px-3 py-2 text-[10px] font-semibold text-[#555] uppercase tracking-wide">Edit Date</div>
              <div className="px-3 py-2 text-[10px] font-semibold text-[#555] uppercase tracking-wide">Post Date</div>
            </div>

            {/* Rows */}
            {groupItems.map((item, idx) => (
              <div
                key={item.id}
                className={`grid items-center hover:bg-[#252525] transition-colors ${idx < groupItems.length - 1 ? 'border-b border-[#2e2e2e]' : ''}`}
                style={{ gridTemplateColumns: '1fr 60px 70px 130px 140px 110px 110px' }}
              >
                {/* Title */}
                <div className="px-3 py-2 flex items-center gap-2">
                  {color && <div className="w-0.5 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
                  <span className="text-sm text-[#e8e8e8] truncate">{item.title}</span>
                </div>

                {/* Posted checkbox */}
                <div className="px-2 py-2 flex justify-center">
                  <Checkbox
                    checked={item.filming_status === 'filmed'}
                    onChange={() => canEdit && updateItem(item.id, 'filming_status', item.filming_status === 'filmed' ? 'not_filmed' : 'filmed')}
                  />
                </div>

                {/* Approved checkbox */}
                <div className="px-2 py-2 flex justify-center">
                  <Checkbox
                    checked={item.approval_status === 'approved'}
                    onChange={() => canEdit && updateItem(item.id, 'approval_status', item.approval_status === 'approved' ? 'pending' : 'approved')}
                  />
                </div>

                {/* Status */}
                <div className="px-3 py-2">
                  {canEdit
                    ? <StatusPill value={item.edit_status} onChange={v => updateItem(item.id, 'edit_status', v)} />
                    : <StatusPill value={item.edit_status} onChange={() => {}} />
                  }
                </div>

                {/* Editor */}
                <div className="px-3 py-2">
                  {canEdit ? (
                    <select
                      value={item.assigned_editor_id ?? ''}
                      onChange={e => updateItem(item.id, 'assigned_editor_id', e.target.value || null)}
                      className="w-full bg-transparent text-xs text-[#888] focus:outline-none focus:text-[#e8e8e8] cursor-pointer"
                    >
                      <option value="">—</option>
                      {editors.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-[#888]">
                      {item.assigned_editor_id ? editorMap[item.assigned_editor_id]?.full_name ?? '—' : '—'}
                    </span>
                  )}
                </div>

                {/* Edit Date (use updated_at as proxy) */}
                <div className="px-3 py-2 text-xs text-[#555]">
                  {item.updated_at ? new Date(item.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                </div>

                {/* Post Date */}
                <div className="px-3 py-2">
                  {canEdit ? (
                    <input
                      type="date"
                      value={item.posted_date ?? ''}
                      onChange={e => updateItem(item.id, 'posted_date', e.target.value || null)}
                      className="w-full bg-transparent text-xs text-[#555] focus:outline-none focus:text-[#e8e8e8] cursor-pointer"
                    />
                  ) : (
                    <span className="text-xs text-[#555]">
                      {item.posted_date ? new Date(item.posted_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* Add row */}
            {canEdit && (
              <button
                onClick={() => { setForm(p => ({ ...p, client_id: key === 'no-client' ? '' : key })); setShowAdd(true) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#555] hover:text-[#888] hover:bg-[#252525] transition-colors border-t border-[#2e2e2e]"
              >
                <Plus size={11} /> New page
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-[#2e2e2e] flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-[#e8e8e8]">Content Dashboard</h1>
          <p className="text-xs text-[#888] mt-0.5">{items.length} videos · {clients.length} clients</p>
        </div>
        {canEdit && (
          <Button onClick={() => setShowAdd(true)}><Plus size={14} /> Add Video</Button>
        )}
      </div>

      {/* Groups */}
      <div className="flex-1 overflow-y-auto py-3">
        {noClient.length > 0 && renderGroup('No Client', null, noClient, 'no-client')}
        {byClient.map(({ client, items: groupItems }) =>
          renderGroup(client.name, client.color, groupItems, client.id)
        )}
        {items.length === 0 && (
          <div className="text-center py-20 text-[#555] text-sm">No videos yet — add your first one</div>
        )}
      </div>

      {/* Add modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Video">
        <div className="space-y-3">
          <Input label="Title" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Audi Q5 vs Q7 Comparison" autoFocus />
          <div>
            <label className="text-xs text-[#888] uppercase tracking-wide block mb-1">Client</label>
            <select value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}
              className="w-full px-3 py-2 rounded-card bg-[#191919] border border-[#2e2e2e] text-[#e8e8e8] text-sm focus:outline-none focus:border-[#4f8ef7]">
              <option value="">No client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <Select label="Status" value={form.edit_status} onChange={e => setForm(p => ({ ...p, edit_status: e.target.value }))}>
            <option value="unassigned">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="revisions">Revisions</option>
            <option value="done">Done</option>
          </Select>
          <div>
            <label className="text-xs text-[#888] uppercase tracking-wide block mb-1">Editor</label>
            <select value={form.assigned_editor_id} onChange={e => setForm(p => ({ ...p, assigned_editor_id: e.target.value }))}
              className="w-full px-3 py-2 rounded-card bg-[#191919] border border-[#2e2e2e] text-[#e8e8e8] text-sm focus:outline-none focus:border-[#4f8ef7]">
              <option value="">Unassigned</option>
              {editors.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </div>
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
