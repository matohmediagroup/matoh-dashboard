'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import type { Client } from '@/types/database'

interface PostSlot {
  id: string
  client_id: string
  post_date: string
  label: string | null
  status: 'scheduled' | 'posted' | 'missed'
}

export default function SchedulePage() {
  const supabase = createClient()
  const [current, setCurrent] = useState(new Date())
  const [slots, setSlots] = useState<PostSlot[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverDay, setDragOverDay] = useState<number | null>(null)
  const [filterClient, setFilterClient] = useState('all')

  // Quick-add state
  const [addingDay, setAddingDay] = useState<number | null>(null)
  const [addForm, setAddForm] = useState({ client_id: '', label: '' })

  const fetchData = useCallback(async () => {
    const [{ data: slotsData }, { data: clientsData }] = await Promise.all([
      supabase.from('post_schedule').select('*').order('post_date'),
      supabase.from('clients').select('*').order('name'),
    ])
    setSlots((slotsData ?? []) as PostSlot[])
    setClients(clientsData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const year = current.getFullYear()
  const month = current.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const monthName = current.toLocaleString('default', { month: 'long', year: 'numeric' })
  const todayStr = new Date().toISOString().split('T')[0]

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]))

  const slotsByDay: Record<number, PostSlot[]> = {}
  slots.forEach(s => {
    const d = new Date(s.post_date + 'T12:00:00')
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate()
      if (!slotsByDay[day]) slotsByDay[day] = []
      slotsByDay[day].push(s)
    }
  })

  const visibleSlots = filterClient === 'all'
    ? slotsByDay
    : Object.fromEntries(
        Object.entries(slotsByDay).map(([d, ss]) => [d, ss.filter(s => s.client_id === filterClient)])
      )

  // ── Drag handlers ──────────────────────────────────────────────────────────
  function onDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOver(e: React.DragEvent, day: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverDay(day)
  }

  async function onDrop(day: number) {
    if (!draggingId) return
    const newDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('post_schedule') as any).update({ post_date: newDate }).eq('id', draggingId)
    setDraggingId(null)
    setDragOverDay(null)
    fetchData()
  }

  // ── Quick add ──────────────────────────────────────────────────────────────
  async function quickAdd() {
    if (!addForm.client_id || addingDay === null) return
    const newDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(addingDay).padStart(2, '0')}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('post_schedule') as any).insert({
      client_id: addForm.client_id,
      post_date: newDate,
      label: addForm.label || null,
      status: 'scheduled',
    })
    setAddingDay(null)
    setAddForm({ client_id: '', label: '' })
    fetchData()
  }

  async function deleteSlot(id: string) {
    await supabase.from('post_schedule').delete().eq('id', id)
    fetchData()
  }

  async function togglePosted(slot: PostSlot) {
    const newStatus = slot.status === 'posted' ? 'scheduled' : 'posted'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('post_schedule') as any).update({ status: newStatus }).eq('id', slot.id)
    fetchData()
  }

  if (loading) return <PageSpinner />

  // Count stats for header
  const thisMonthSlots = slots.filter(s => {
    const d = new Date(s.post_date + 'T12:00:00')
    return d.getFullYear() === year && d.getMonth() === month
  })
  const posted = thisMonthSlots.filter(s => s.status === 'posted').length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2e2e2e] flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-[#e8e8e8]">Post Schedule</h1>
          <p className="text-xs text-[#888] mt-0.5">
            {posted}/{thisMonthSlots.length} posted this month · drag to reschedule · click + to add
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
            className="px-3 py-1.5 rounded-card bg-[#191919] border border-[#2e2e2e] text-[#888] text-xs focus:outline-none">
            <option value="all">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrent(new Date(year, month - 1, 1))} className="p-1.5 rounded-card text-[#888] hover:text-[#e8e8e8] hover:bg-[#252525]"><ChevronLeft size={16} /></button>
            <span className="text-sm font-medium text-[#e8e8e8] min-w-[140px] text-center">{monthName}</span>
            <button onClick={() => setCurrent(new Date(year, month + 1, 1))} className="p-1.5 rounded-card text-[#888] hover:text-[#e8e8e8] hover:bg-[#252525]"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {/* Client legend */}
      <div className="flex flex-wrap gap-3 px-6 py-2 border-b border-[#2e2e2e] flex-shrink-0">
        {clients.map(c => (
          <div key={c.id} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
            <span className="text-[10px] text-[#888]">{c.name}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-7 gap-px bg-[#2e2e2e] rounded-card overflow-hidden">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="bg-[#191919] px-2 py-2 text-center text-[10px] font-medium text-[#888] uppercase tracking-wide">{d}</div>
          ))}

          {cells.map((day, i) => {
            const daySlots = day ? (visibleSlots[day] ?? []) : []
            const dateStr = day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : ''
            const isToday = dateStr === todayStr
            const isOver = dragOverDay === day

            return (
              <div
                key={i}
                className={`bg-[#202020] min-h-[110px] p-1.5 flex flex-col transition-colors ${isOver && draggingId ? 'bg-[#4f8ef7]/10 ring-1 ring-inset ring-[#4f8ef7]/40' : ''}`}
                onDragOver={day ? e => onDragOver(e, day) : undefined}
                onDragLeave={() => setDragOverDay(null)}
                onDrop={day ? () => onDrop(day) : undefined}
              >
                {day && (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium ${isToday ? 'text-[#4f8ef7] bg-[#4f8ef7]/20 w-5 h-5 rounded-full flex items-center justify-center' : 'text-[#888]'}`}>
                        {day}
                      </span>
                      <button
                        onClick={() => { setAddingDay(day); setAddForm({ client_id: clients[0]?.id ?? '', label: '' }) }}
                        className="opacity-0 hover:opacity-100 group-hover:opacity-100 p-0.5 rounded text-[#555] hover:text-[#4f8ef7] hover:bg-[#4f8ef7]/10 transition-all"
                        style={{ opacity: addingDay === day ? 1 : undefined }}
                      >
                        <Plus size={10} />
                      </button>
                    </div>

                    {/* Quick add form */}
                    {addingDay === day && (
                      <div className="mb-1 p-1.5 bg-[#191919] rounded-card border border-[#3a3a3a] space-y-1">
                        <select value={addForm.client_id} onChange={e => setAddForm(p => ({ ...p, client_id: e.target.value }))}
                          className="w-full px-1.5 py-1 rounded bg-[#252525] border border-[#2e2e2e] text-[#e8e8e8] text-[10px] focus:outline-none">
                          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <input
                          type="text"
                          value={addForm.label}
                          onChange={e => setAddForm(p => ({ ...p, label: e.target.value }))}
                          placeholder="Note (optional)"
                          className="w-full px-1.5 py-1 rounded bg-[#252525] border border-[#2e2e2e] text-[#e8e8e8] text-[10px] focus:outline-none placeholder-[#555]"
                          onKeyDown={e => { if (e.key === 'Enter') quickAdd(); if (e.key === 'Escape') setAddingDay(null) }}
                          autoFocus
                        />
                        <div className="flex gap-1">
                          <button onClick={quickAdd} className="flex-1 py-0.5 rounded bg-[#4f8ef7] text-white text-[10px] font-medium">Add</button>
                          <button onClick={() => setAddingDay(null)} className="px-2 py-0.5 rounded bg-[#2e2e2e] text-[#888] text-[10px]">✕</button>
                        </div>
                      </div>
                    )}

                    {/* Slots */}
                    <div className="flex-1 space-y-0.5">
                      {daySlots.map(slot => {
                        const client = clientMap[slot.client_id]
                        const isDragging = draggingId === slot.id
                        return (
                          <div
                            key={slot.id}
                            draggable
                            onDragStart={e => onDragStart(e, slot.id)}
                            onDragEnd={() => { setDraggingId(null); setDragOverDay(null) }}
                            className={`group flex items-center gap-1 px-1.5 py-0.5 rounded-chip cursor-grab active:cursor-grabbing transition-all select-none ${isDragging ? 'opacity-30' : 'hover:opacity-90'} ${slot.status === 'posted' ? 'opacity-60' : ''}`}
                            style={{ backgroundColor: client ? `${client.color}25` : '#2e2e2e' }}
                          >
                            {/* Color dot */}
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: client?.color || '#888' }} />
                            <span
                              className={`text-[10px] font-medium flex-1 truncate ${slot.status === 'posted' ? 'line-through' : ''}`}
                              style={{ color: client?.color || '#888' }}
                            >
                              {slot.label || client?.name?.split(' ')[0] || 'Post'}
                            </span>
                            {/* Actions (show on hover) */}
                            <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                              <button
                                onClick={e => { e.stopPropagation(); togglePosted(slot) }}
                                className="p-0.5 rounded hover:bg-[#10b981]/20"
                                title={slot.status === 'posted' ? 'Mark unposted' : 'Mark posted'}
                              >
                                <Check size={9} className={slot.status === 'posted' ? 'text-[#10b981]' : 'text-[#555]'} />
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); deleteSlot(slot.id) }}
                                className="p-0.5 rounded hover:bg-[#ef4444]/20"
                              >
                                <X size={9} className="text-[#555] hover:text-[#ef4444]" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
