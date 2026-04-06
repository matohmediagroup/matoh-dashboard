'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Input'
import { logActivity } from '@/lib/activity'
import type { ContentItem, Client, Profile } from '@/types/database'
import { X } from 'lucide-react'

type EditStatus = 'unassigned' | 'in_progress' | 'revisions' | 'done'

const COLUMNS: { id: EditStatus; label: string }[] = [
  { id: 'unassigned', label: 'To Film' },
  { id: 'in_progress', label: 'To Edit' },
  { id: 'revisions', label: 'Revisions' },
  { id: 'done', label: 'Done' },
]

interface Props {
  items: ContentItem[]
  clientMap: Record<string, Client>
  onRefresh: () => void
  userRole: string
  userId: string
  editors: Profile[]
}

export function ContentKanban({ items, clientMap, onRefresh, userRole, userId, editors }: Props) {
  const supabase = createClient()
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<EditStatus | null>(null)
  const [selected, setSelected] = useState<ContentItem | null>(null)

  const canEdit = userRole === 'owner' || userRole === 'manager'

  async function handleDrop(targetStatus: EditStatus) {
    if (!dragging || !canEdit) return
    const item = items.find(i => i.id === dragging)
    if (!item || item.edit_status === targetStatus) { setDragging(null); setDragOver(null); return }
    await supabase.from('content_items').update({ edit_status: targetStatus }).eq('id', dragging)
    await logActivity('content_updated', `"${item.title}" moved to ${targetStatus}`, 'content_item', item.id)
    setDragging(null)
    setDragOver(null)
    onRefresh()
  }

  async function updateField(field: string, value: string | null) {
    if (!selected) return
    await supabase.from('content_items').update({ [field]: value || null }).eq('id', selected.id)
    await logActivity('content_updated', `"${selected.title}" ${field} updated`, 'content_item', selected.id)
    setSelected(prev => prev ? { ...prev, [field]: value } : null)
    onRefresh()
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-3 h-full p-4 min-w-max">
          {COLUMNS.map(col => {
            const colItems = items.filter(i => i.edit_status === col.id)
            const isOver = dragOver === col.id
            return (
              <div
                key={col.id}
                className="w-72 flex flex-col"
                onDragOver={e => { e.preventDefault(); setDragOver(col.id) }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => handleDrop(col.id)}
              >
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-semibold text-[#888] uppercase tracking-wide">{col.label}</span>
                  <span className="text-xs text-[#888] bg-[#2e2e2e] px-1.5 py-0.5 rounded-chip">{colItems.length}</span>
                </div>
                <div className={`flex-1 overflow-y-auto space-y-2 rounded-card transition-colors p-1 ${isOver && canEdit ? 'bg-[#4f8ef7]/5 border border-dashed border-[#4f8ef7]/30' : ''}`}>
                  {colItems.map(item => {
                    const client = item.client_id ? clientMap[item.client_id] : null
                    const editor = item.assigned_editor_id ? editors.find(e => e.id === item.assigned_editor_id) : null
                    return (
                      <div
                        key={item.id}
                        draggable={canEdit}
                        onDragStart={() => setDragging(item.id)}
                        onDragEnd={() => { setDragging(null); setDragOver(null) }}
                        onClick={() => setSelected(item)}
                        className={`bg-[#202020] border border-[#2e2e2e] rounded-card p-3 cursor-pointer hover:border-[#3a3a3a] transition-all select-none ${dragging === item.id ? 'opacity-40' : ''}`}
                      >
                        <p className="text-sm font-medium text-[#e8e8e8] mb-2 leading-snug">{item.title}</p>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {client && <Badge color={client.color} label={client.name.split(' ')[0]} />}
                          <Badge variant={item.filming_status as 'not_filmed' | 'filmed'} />
                          {item.approval_status !== 'pending' && <Badge variant={item.approval_status as 'approved' | 'rejected'} />}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-[#888]">
                            {editor ? editor.full_name.split(' ')[0] : 'Unassigned'}
                          </span>
                          {item.posted_date && (
                            <span className="text-[10px] text-[#888]">
                              {new Date(item.posted_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-80 border-l border-[#2e2e2e] bg-[#202020] flex flex-col overflow-y-auto flex-shrink-0">
          <div className="flex items-center justify-between p-4 border-b border-[#2e2e2e]">
            <h3 className="text-sm font-semibold text-[#e8e8e8] truncate pr-2">{selected.title}</h3>
            <button onClick={() => setSelected(null)} className="p-1 rounded-chip text-[#888] hover:text-[#e8e8e8] flex-shrink-0"><X size={14} /></button>
          </div>
          <div className="p-4 space-y-4">
            {selected.client_id && clientMap[selected.client_id] && (
              <div>
                <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">Client</p>
                <Badge color={clientMap[selected.client_id].color} label={clientMap[selected.client_id].name} />
              </div>
            )}
            <div>
              <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">Post Date</p>
              <input type="date" value={selected.posted_date ?? ''} onChange={e => updateField('posted_date', e.target.value)}
                className="w-full px-2 py-1.5 rounded-card bg-[#191919] border border-[#2e2e2e] text-[#e8e8e8] text-sm focus:outline-none focus:border-[#4f8ef7]" />
            </div>
            <div>
              <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">Filming Status</p>
              <Select value={selected.filming_status} onChange={e => updateField('filming_status', e.target.value)}>
                <option value="not_filmed">Not Filmed</option>
                <option value="filmed">Filmed</option>
              </Select>
            </div>
            <div>
              <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">Edit Status</p>
              <Select value={selected.edit_status} onChange={e => updateField('edit_status', e.target.value)}>
                <option value="unassigned">Unassigned</option>
                <option value="in_progress">In Progress</option>
                <option value="revisions">Revisions</option>
                <option value="done">Done</option>
              </Select>
            </div>
            <div>
              <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">Approval</p>
              <Select value={selected.approval_status} onChange={e => updateField('approval_status', e.target.value)}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </Select>
            </div>
            {canEdit && (
              <div>
                <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">Assigned Editor</p>
                <Select value={selected.assigned_editor_id ?? ''} onChange={e => updateField('assigned_editor_id', e.target.value || null)}>
                  <option value="">Unassigned</option>
                  {editors.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </Select>
              </div>
            )}
            <div>
              <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1">Caption</p>
              <textarea
                value={selected.caption ?? ''}
                onChange={e => setSelected(prev => prev ? { ...prev, caption: e.target.value } : null)}
                onBlur={e => updateField('caption', e.target.value)}
                rows={4}
                className="w-full px-2 py-1.5 rounded-card bg-[#191919] border border-[#2e2e2e] text-[#e8e8e8] text-sm focus:outline-none focus:border-[#4f8ef7] resize-none"
                placeholder="Caption…"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
