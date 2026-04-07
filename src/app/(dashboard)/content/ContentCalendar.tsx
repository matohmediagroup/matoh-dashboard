'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, X, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Input'
import { logActivity } from '@/lib/activity'
import type { ContentItem, Client, Profile } from '@/types/database'

interface Props {
  items: ContentItem[]
  clientMap: Record<string, Client>
  onRefresh: () => void
  userRole: string
  editors: Profile[]
}

export function ContentCalendar({ items, clientMap, onRefresh, userRole, editors }: Props) {
  const [current, setCurrent] = useState(new Date())
  const [selected, setSelected] = useState<ContentItem | null>(null)
  const supabase = createClient()

  const year = current.getFullYear()
  const month = current.getMonth()

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (number | null)[] = Array(firstDay).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const itemsByDay: Record<number, ContentItem[]> = {}
  items.forEach(item => {
    if (!item.posted_date) return
    const d = new Date(item.posted_date)
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate()
      if (!itemsByDay[day]) itemsByDay[day] = []
      itemsByDay[day].push(item)
    }
  })

  async function updateField(field: string, value: string | null) {
    if (!selected) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('content_items') as any).update({ [field]: value || null }).eq('id', selected.id)
    await logActivity('content_updated', `Content "${selected.title}" ${field} updated`, 'content_item', selected.id)
    setSelected(prev => prev ? { ...prev, [field]: value } : null)
    onRefresh()
  }

  const monthName = current.toLocaleString('default', { month: 'long', year: 'numeric' })

  return (
    <div className="flex h-full overflow-hidden">
      {/* Calendar */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center gap-4 mb-4">
          <button onClick={() => setCurrent(new Date(year, month - 1, 1))} className="p-1.5 rounded-card text-[#888] hover:text-[#e8e8e8] hover:bg-[#252525]">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-sm font-semibold text-[#e8e8e8] min-w-[140px] text-center">{monthName}</h2>
          <button onClick={() => setCurrent(new Date(year, month + 1, 1))} className="p-1.5 rounded-card text-[#888] hover:text-[#e8e8e8] hover:bg-[#252525]">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-px bg-[#2e2e2e] rounded-card overflow-hidden">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="bg-[#191919] px-2 py-2 text-center text-[10px] font-medium text-[#888] uppercase tracking-wide">
              {d}
            </div>
          ))}
          {cells.map((day, i) => (
            <div key={i} className="bg-[#202020] min-h-[90px] p-1.5">
              {day && (
                <>
                  <p className="text-xs text-[#888] mb-1">{day}</p>
                  <div className="space-y-0.5">
                    {(itemsByDay[day] ?? []).map(item => {
                      const client = item.client_id ? clientMap[item.client_id] : null
                      return (
                        <button
                          key={item.id}
                          onClick={() => setSelected(item)}
                          className="w-full text-left px-1.5 py-0.5 rounded-chip text-[10px] font-medium truncate transition-opacity hover:opacity-80"
                          style={{
                            backgroundColor: client ? `${client.color}30` : '#2e2e2e',
                            color: client ? client.color : '#888',
                          }}
                        >
                          {item.title}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Side panel */}
      {selected && (
        <div className="w-80 border-l border-[#2e2e2e] bg-[#202020] flex flex-col overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b border-[#2e2e2e]">
            <h3 className="text-sm font-semibold text-[#e8e8e8] truncate pr-2">{selected.title}</h3>
            <button onClick={() => setSelected(null)} className="p-1 rounded-chip text-[#888] hover:text-[#e8e8e8] flex-shrink-0">
              <X size={14} />
            </button>
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
              <input
                type="date"
                value={selected.posted_date ?? ''}
                onChange={e => updateField('posted_date', e.target.value)}
                className="w-full px-2 py-1.5 rounded-card bg-[#191919] border border-[#2e2e2e] text-[#e8e8e8] text-sm focus:outline-none focus:border-[#4f8ef7]"
              />
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
            {(userRole === 'owner' || userRole === 'manager') && (
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
