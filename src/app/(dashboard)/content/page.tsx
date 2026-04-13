'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, ChevronDown, ChevronRight, LayoutList, Columns, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import type { ContentItem, Client, Profile } from '@/types/database'

const STATUS_OPTIONS = [
  { value: 'unassigned',  label: 'Not Started',  bg: '#2a2a2a', color: '#888',    border: '#3a3a3a' },
  { value: 'in_progress', label: 'In Progress',  bg: '#1e3a5f', color: '#4f8ef7', border: '#2a4a7a' },
  { value: 'revisions',   label: 'Revisions',    bg: '#3d2e00', color: '#f59e0b', border: '#5a4500' },
  { value: 'done',        label: 'Done',         bg: '#0d3d2a', color: '#10b981', border: '#1a5a3a' },
  { value: 'posted',      label: 'Posted',       bg: '#2d1657', color: '#a855f7', border: '#4a2a80' },
]

type ViewMode = 'table' | 'kanban' | 'editor'

function StatusPill({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const s = STATUS_OPTIONS.find(o => o.value === value) || STATUS_OPTIONS[0]
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
        style={{ backgroundColor: s.bg, color: s.color }}>
        {s.label}
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-[#252525] border border-[#3a3a3a] rounded-card shadow-xl overflow-hidden min-w-[120px]">
          {STATUS_OPTIONS.map(o => (
            <button key={o.value} onClick={() => { onChange(o.value); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#2e2e2e] transition-colors"
              style={{ color: o.color }}>
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
    <button onClick={onChange}
      className={`w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${checked ? 'bg-[#10b981] border-[#10b981]' : 'border-[#3a3a3a] hover:border-[#888]'}`}>
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
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [filterPosted, setFilterPosted] = useState<'all' | 'posted' | 'unposted'>('all')
  const [filterClient, setFilterClient] = useState('all')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
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

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]))
  const editorMap = Object.fromEntries(editors.map(e => [e.id, e]))
  const canEdit = userRole === 'owner' || userRole === 'manager'

  // resolve edit_status for an item — if filmed treat as 'posted'
  function resolvedStatus(item: ContentItem) {
    if (item.filming_status === 'filmed') return 'posted'
    return item.edit_status || 'unassigned'
  }

  const filteredItems = items.filter(item => {
    const postedMatch =
      filterPosted === 'all' ? true :
      filterPosted === 'posted' ? item.filming_status === 'filmed' :
      item.filming_status !== 'filmed'
    const clientMatch = filterClient === 'all' || item.client_id === filterClient
    return postedMatch && clientMatch
  })

  // ── TABLE VIEW ──────────────────────────────────────────────────────────────
  const noClient = filteredItems.filter(i => !i.client_id)
  const byClient = clients.map(c => ({
    client: c,
    items: filteredItems.filter(i => i.client_id === c.id),
  })).filter(g => g.items.length > 0)

  function toggleCollapse(id: string) {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function renderTableGroup(label: string, color: string | null, groupItems: ContentItem[], key: string) {
    const isCollapsed = collapsed[key]
    const postedCount = groupItems.filter(i => i.filming_status === 'filmed').length
    const approvedCount = groupItems.filter(i => i.approval_status === 'approved').length
    return (
      <div key={key} className="mb-1">
        <button onClick={() => toggleCollapse(key)}
          className="w-full flex items-center gap-2 px-4 py-2 hover:bg-[#252525] transition-colors text-left">
          {isCollapsed ? <ChevronRight size={13} className="text-[#888] flex-shrink-0" /> : <ChevronDown size={13} className="text-[#888] flex-shrink-0" />}
          {color && <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />}
          <span className="text-sm font-semibold text-[#e8e8e8]">{label}</span>
          <span className="text-xs text-[#555] ml-1">{groupItems.length} videos</span>
          {postedCount > 0 && <span className="text-[10px] text-[#10b981] ml-1">{postedCount} posted</span>}
          {approvedCount > 0 && <span className="text-[10px] text-[#4f8ef7] ml-1">{approvedCount} approved</span>}
        </button>
        {!isCollapsed && (
          <div className="mx-4 mb-3 border border-[#2e2e2e] rounded-card overflow-hidden">
            <div className="grid bg-[#191919] border-b border-[#2e2e2e]" style={{ gridTemplateColumns: '1fr 60px 70px 130px 140px 110px 110px' }}>
              {['Title','Posted','Approved','Status','Editor','Edit Date','Post Date'].map(h => (
                <div key={h} className="px-3 py-2 text-[10px] font-semibold text-[#555] uppercase tracking-wide">{h}</div>
              ))}
            </div>
            {groupItems.map((item, idx) => (
              <div key={item.id}
                className={`grid items-center hover:bg-[#252525] transition-colors ${idx < groupItems.length - 1 ? 'border-b border-[#2e2e2e]' : ''}`}
                style={{ gridTemplateColumns: '1fr 60px 70px 130px 140px 110px 110px' }}>
                <div className="px-3 py-2 flex items-center gap-2">
                  {color && <div className="w-0.5 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
                  <span className="text-sm text-[#e8e8e8] truncate">{item.title}</span>
                </div>
                <div className="px-2 py-2 flex justify-center">
                  <Checkbox checked={item.filming_status === 'filmed'}
                    onChange={() => canEdit && updateItem(item.id, 'filming_status', item.filming_status === 'filmed' ? 'not_filmed' : 'filmed')} />
                </div>
                <div className="px-2 py-2 flex justify-center">
                  <Checkbox checked={item.approval_status === 'approved'}
                    onChange={() => canEdit && updateItem(item.id, 'approval_status', item.approval_status === 'approved' ? 'pending' : 'approved')} />
                </div>
                <div className="px-3 py-2">
                  {canEdit
                    ? <StatusPill value={item.edit_status} onChange={v => updateItem(item.id, 'edit_status', v)} />
                    : <StatusPill value={item.edit_status} onChange={() => {}} />}
                </div>
                <div className="px-3 py-2">
                  {canEdit ? (
                    <select value={item.assigned_editor_id ?? ''}
                      onChange={e => updateItem(item.id, 'assigned_editor_id', e.target.value || null)}
                      className="w-full bg-transparent text-xs text-[#888] focus:outline-none focus:text-[#e8e8e8] cursor-pointer">
                      <option value="">—</option>
                      {editors.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-[#888]">{item.assigned_editor_id ? editorMap[item.assigned_editor_id]?.full_name ?? '—' : '—'}</span>
                  )}
                </div>
                <div className="px-3 py-2 text-xs text-[#555]">
                  {item.updated_at ? new Date(item.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                </div>
                <div className="px-3 py-2">
                  {canEdit ? (
                    <input type="date" value={item.posted_date ?? ''}
                      onChange={e => updateItem(item.id, 'posted_date', e.target.value || null)}
                      className="w-full bg-transparent text-xs text-[#555] focus:outline-none focus:text-[#e8e8e8] cursor-pointer" />
                  ) : (
                    <span className="text-xs text-[#555]">
                      {item.posted_date ? new Date(item.posted_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {canEdit && (
              <button onClick={() => { setForm(p => ({ ...p, client_id: key === 'no-client' ? '' : key })); setShowAdd(true) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#555] hover:text-[#888] hover:bg-[#252525] transition-colors border-t border-[#2e2e2e]">
                <Plus size={11} /> New video
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── KANBAN VIEW ─────────────────────────────────────────────────────────────
  function KanbanCard({ item }: { item: ContentItem }) {
    const client = item.client_id ? clientMap[item.client_id] : null
    const editor = item.assigned_editor_id ? editorMap[item.assigned_editor_id] : null
    return (
      <div
        draggable
        onDragStart={e => { setDraggingId(item.id); e.dataTransfer.effectAllowed = 'move' }}
        onDragEnd={() => { setDraggingId(null); setDragOverCol(null) }}
        className={`bg-[#191919] border border-[#2e2e2e] rounded-card p-3 cursor-grab active:cursor-grabbing select-none transition-opacity hover:border-[#3a3a3a] group ${draggingId === item.id ? 'opacity-30' : ''}`}
      >
        {client && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: client.color }} />
            <span className="text-[10px] text-[#555]">{client.name}</span>
          </div>
        )}
        <p className="text-xs font-medium text-[#e8e8e8] leading-snug mb-2">{item.title}</p>
        <div className="flex items-center justify-between">
          {editor ? (
            <span className="text-[10px] text-[#555] bg-[#252525] px-1.5 py-0.5 rounded">{editor.full_name?.split(' ')[0]}</span>
          ) : (
            <span className="text-[10px] text-[#444]">Unassigned</span>
          )}
          {item.approval_status === 'approved' && (
            <span className="text-[10px] text-[#4f8ef7]">✓ Approved</span>
          )}
        </div>
      </div>
    )
  }

  async function onKanbanDrop(colStatus: string) {
    if (!draggingId) return
    const item = items.find(i => i.id === draggingId)
    if (!item) return
    if (colStatus === 'posted') {
      await updateItem(draggingId, 'filming_status', 'filmed')
    } else {
      if (item.filming_status === 'filmed') await updateItem(draggingId, 'filming_status', 'not_filmed')
      await updateItem(draggingId, 'edit_status', colStatus)
    }
    setDraggingId(null)
    setDragOverCol(null)
  }

  function renderKanban() {
    return (
      <div className="flex gap-3 p-4 h-full overflow-x-auto">
        {STATUS_OPTIONS.map(col => {
          const colItems = filteredItems.filter(i => resolvedStatus(i) === col.value)
          const isOver = dragOverCol === col.value
          return (
            <div key={col.value}
              className={`flex-shrink-0 w-64 flex flex-col rounded-card border transition-colors ${isOver ? 'border-[#4f8ef7]/50 bg-[#4f8ef7]/5' : 'border-[#2e2e2e] bg-[#1a1a1a]'}`}
              onDragOver={e => { e.preventDefault(); setDragOverCol(col.value) }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={() => onKanbanDrop(col.value)}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#2e2e2e]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                  <span className="text-xs font-semibold text-[#e8e8e8]">{col.label}</span>
                </div>
                <span className="text-[10px] text-[#555] bg-[#252525] px-1.5 py-0.5 rounded-full">{colItems.length}</span>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {colItems.map(item => <KanbanCard key={item.id} item={item} />)}
                {colItems.length === 0 && (
                  <div className="text-center py-8 text-[#444] text-[11px]">Drop here</div>
                )}
              </div>

              {/* Add button */}
              {canEdit && col.value !== 'posted' && (
                <button onClick={() => { setForm(p => ({ ...p, edit_status: col.value })); setShowAdd(true) }}
                  className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-[#555] hover:text-[#888] hover:bg-[#252525] transition-colors border-t border-[#2e2e2e] rounded-b-card">
                  <Plus size={11} /> Add video
                </button>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ── BY EDITOR VIEW ──────────────────────────────────────────────────────────
  function renderByEditor() {
    const unassigned = filteredItems.filter(i => !i.assigned_editor_id && resolvedStatus(i) !== 'posted')
    return (
      <div className="p-4 space-y-4 overflow-y-auto h-full">
        {editors.map(editor => {
          const editorItems = filteredItems.filter(i => i.assigned_editor_id === editor.id)
          if (editorItems.length === 0) return null
          const inProgress = editorItems.filter(i => resolvedStatus(i) === 'in_progress').length
          const done = editorItems.filter(i => resolvedStatus(i) === 'done').length
          const posted = editorItems.filter(i => resolvedStatus(i) === 'posted').length
          const isCollapsed = collapsed[`editor-${editor.id}`]

          return (
            <div key={editor.id} className="bg-[#202020] border border-[#2e2e2e] rounded-card overflow-hidden">
              <button onClick={() => toggleCollapse(`editor-${editor.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#252525] transition-colors">
                <div className="w-7 h-7 rounded-full bg-[#4f8ef7]/20 text-[#4f8ef7] text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {editor.full_name?.charAt(0) ?? '?'}
                </div>
                <span className="text-sm font-semibold text-[#e8e8e8] flex-1 text-left">{editor.full_name}</span>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-[#4f8ef7]">{inProgress} in progress</span>
                  <span className="text-[#10b981]">{done} done</span>
                  <span className="text-[#a855f7]">{posted} posted</span>
                  <span className="text-[#888] bg-[#252525] px-2 py-0.5 rounded-full">{editorItems.length} total</span>
                </div>
                {isCollapsed ? <ChevronRight size={13} className="text-[#555]" /> : <ChevronDown size={13} className="text-[#555]" />}
              </button>

              {!isCollapsed && (
                <div className="border-t border-[#2e2e2e]">
                  {editorItems.map((item, idx) => {
                    const client = item.client_id ? clientMap[item.client_id] : null
                    const status = STATUS_OPTIONS.find(s => s.value === resolvedStatus(item)) || STATUS_OPTIONS[0]
                    return (
                      <div key={item.id}
                        className={`flex items-center gap-3 px-4 py-2.5 hover:bg-[#252525] transition-colors ${idx < editorItems.length - 1 ? 'border-b border-[#2e2e2e]' : ''}`}>
                        {client && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: client.color }} />}
                        <span className="text-sm text-[#e8e8e8] flex-1 truncate">{item.title}</span>
                        {client && <span className="text-[10px] text-[#555] flex-shrink-0">{client.name}</span>}
                        <span className="text-[10px] px-2 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: status.bg, color: status.color }}>
                          {status.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Unassigned */}
        {unassigned.length > 0 && (
          <div className="bg-[#202020] border border-[#2e2e2e] rounded-card overflow-hidden">
            <button onClick={() => toggleCollapse('editor-unassigned')}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#252525] transition-colors">
              <div className="w-7 h-7 rounded-full bg-[#3a3a3a] text-[#555] text-xs font-bold flex items-center justify-center flex-shrink-0">?</div>
              <span className="text-sm font-semibold text-[#888] flex-1 text-left">Unassigned</span>
              <span className="text-[11px] text-[#888] bg-[#252525] px-2 py-0.5 rounded-full">{unassigned.length}</span>
              {collapsed['editor-unassigned'] ? <ChevronRight size={13} className="text-[#555]" /> : <ChevronDown size={13} className="text-[#555]" />}
            </button>
            {!collapsed['editor-unassigned'] && (
              <div className="border-t border-[#2e2e2e]">
                {unassigned.map((item, idx) => {
                  const client = item.client_id ? clientMap[item.client_id] : null
                  const status = STATUS_OPTIONS.find(s => s.value === resolvedStatus(item)) || STATUS_OPTIONS[0]
                  return (
                    <div key={item.id}
                      className={`flex items-center gap-3 px-4 py-2.5 hover:bg-[#252525] transition-colors ${idx < unassigned.length - 1 ? 'border-b border-[#2e2e2e]' : ''}`}>
                      {client && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: client.color }} />}
                      <span className="text-sm text-[#e8e8e8] flex-1 truncate">{item.title}</span>
                      {client && <span className="text-[10px] text-[#555] flex-shrink-0">{client.name}</span>}
                      <span className="text-[10px] px-2 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: status.bg, color: status.color }}>
                        {status.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2e2e2e] flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-[#e8e8e8]">Content Dashboard</h1>
          <p className="text-xs text-[#888] mt-0.5">{filteredItems.length} videos · {clients.length} clients</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center bg-[#191919] border border-[#2e2e2e] rounded-card p-0.5">
            <button onClick={() => setViewMode('table')}
              title="Table"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${viewMode === 'table' ? 'bg-[#2e2e2e] text-[#e8e8e8]' : 'text-[#555] hover:text-[#888]'}`}>
              <LayoutList size={13} /> Table
            </button>
            <button onClick={() => setViewMode('kanban')}
              title="Kanban"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${viewMode === 'kanban' ? 'bg-[#2e2e2e] text-[#e8e8e8]' : 'text-[#555] hover:text-[#888]'}`}>
              <Columns size={13} /> Kanban
            </button>
            <button onClick={() => setViewMode('editor')}
              title="By Editor"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${viewMode === 'editor' ? 'bg-[#2e2e2e] text-[#e8e8e8]' : 'text-[#555] hover:text-[#888]'}`}>
              <Users size={13} /> By Editor
            </button>
          </div>

          {/* Client filter */}
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
            className="px-3 py-1.5 rounded-card bg-[#191919] border border-[#2e2e2e] text-[#888] text-xs focus:outline-none">
            <option value="all">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Posted filter */}
          <div className="flex items-center gap-0.5 bg-[#191919] border border-[#2e2e2e] rounded-card p-0.5">
            {(['all', 'unposted', 'posted'] as const).map(f => (
              <button key={f} onClick={() => setFilterPosted(f)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${filterPosted === f ? 'bg-[#2e2e2e] text-[#e8e8e8]' : 'text-[#555] hover:text-[#888]'}`}>
                {f === 'all' ? 'All' : f === 'unposted' ? 'Unposted' : 'Posted'}
              </button>
            ))}
          </div>

          {canEdit && (
            <Button onClick={() => setShowAdd(true)}><Plus size={14} /> Add Video</Button>
          )}
        </div>
      </div>

      {/* Views */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'table' && (
          <div className="h-full overflow-y-auto py-3">
            {noClient.length > 0 && renderTableGroup('No Client', null, noClient, 'no-client')}
            {byClient.map(({ client, items: groupItems }) =>
              renderTableGroup(client.name, client.color, groupItems, client.id)
            )}
            {filteredItems.length === 0 && (
              <div className="text-center py-20 text-[#555] text-sm">
                {items.length === 0 ? 'No videos yet — add your first one' : 'No videos match the current filter'}
              </div>
            )}
          </div>
        )}

        {viewMode === 'kanban' && renderKanban()}
        {viewMode === 'editor' && renderByEditor()}
      </div>

      {/* Add modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Video">
        <div className="space-y-3">
          <Input label="Title" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="e.g. Audi Q5 vs Q7 Comparison" autoFocus />
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
          <Input label="Post Date" type="date" value={form.posted_date}
            onChange={e => setForm(p => ({ ...p, posted_date: e.target.value }))} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={addItem} disabled={saving}>{saving ? 'Saving…' : 'Add Video'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
