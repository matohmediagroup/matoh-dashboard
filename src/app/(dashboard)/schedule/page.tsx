'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Check, BarChart2, CalendarDays, TrendingUp, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageSpinner } from '@/components/ui/Spinner'
import type { Client } from '@/types/database'

interface PostSlot {
  id: string
  client_id: string
  post_date: string
  label: string | null
  status: 'scheduled' | 'posted' | 'missed'
}

interface ClientWithTarget extends Client {
  monthly_target?: number | null
}

type ViewMode = 'calendar' | 'stats'

function pad(n: number) { return String(n).padStart(2, '0') }

export default function SchedulePage() {
  const supabase = createClient()
  const [viewMode, setViewMode] = useState<ViewMode>('calendar')
  const [current, setCurrent]   = useState(new Date())
  const [slots, setSlots]       = useState<PostSlot[]>([])
  const [clients, setClients]   = useState<ClientWithTarget[]>([])
  const [loading, setLoading]   = useState(true)
  const [draggingId, setDraggingId]   = useState<string | null>(null)
  const [dragOverDay, setDragOverDay] = useState<number | null>(null)
  const [filterClient, setFilterClient] = useState('all')
  const [addingDay, setAddingDay] = useState<number | null>(null)
  const [addForm, setAddForm]    = useState({ client_id: '', label: '' })
  const [savingTarget, setSavingTarget] = useState<string | null>(null)

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

  // ── Date math ──────────────────────────────────────────────────────────────
  const year  = current.getFullYear()
  const month = current.getMonth()
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  const prevMonth    = new Date(year, month - 1, 1)
  const prevYear     = prevMonth.getFullYear()
  const prevMonthIdx = prevMonth.getMonth()

  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  const monthName = current.toLocaleString('default', { month: 'long', year: 'numeric' })
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]))

  // ── Slot helpers ───────────────────────────────────────────────────────────
  function slotsForMonth(y: number, m: number) {
    return slots.filter(s => {
      const d = new Date(s.post_date + 'T12:00:00')
      return d.getFullYear() === y && d.getMonth() === m
    })
  }

  const thisMonthSlots = slotsForMonth(year, month)
  const prevMonthSlots = slotsForMonth(prevYear, prevMonthIdx)

  // MTD = slots this month where post_date <= today
  const mtdSlots = thisMonthSlots.filter(s => s.post_date <= todayStr)

  // Calendar grouped by day
  const slotsByDay: Record<number, PostSlot[]> = {}
  thisMonthSlots.forEach(s => {
    const day = new Date(s.post_date + 'T12:00:00').getDate()
    if (!slotsByDay[day]) slotsByDay[day] = []
    slotsByDay[day].push(s)
  })
  const visibleSlots = filterClient === 'all'
    ? slotsByDay
    : Object.fromEntries(Object.entries(slotsByDay).map(([d, ss]) => [d, ss.filter(s => s.client_id === filterClient)]))

  // ── CRUD ───────────────────────────────────────────────────────────────────
  async function quickAdd() {
    if (!addForm.client_id || addingDay === null) return
    const newDate = `${year}-${pad(month + 1)}-${pad(addingDay)}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('post_schedule') as any).insert({
      client_id: addForm.client_id,
      post_date: newDate,
      label: addForm.label || null,
      status: 'scheduled',
    })
    setAddingDay(null)
    setAddForm({ client_id: clients[0]?.id ?? '', label: '' })
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
    // Optimistic update
    setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, status: newStatus } : s))
  }

  async function saveMonthlyTarget(clientId: string, target: number) {
    setSavingTarget(clientId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('clients') as any).update({ monthly_target: target }).eq('id', clientId)
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, monthly_target: target } : c))
    setSavingTarget(null)
  }

  // ── Drag ───────────────────────────────────────────────────────────────────
  function onDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id); e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOver(e: React.DragEvent, day: number) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverDay(day)
  }
  async function onDrop(day: number) {
    if (!draggingId) return
    const newDate = `${year}-${pad(month + 1)}-${pad(day)}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('post_schedule') as any).update({ post_date: newDate }).eq('id', draggingId)
    setDraggingId(null); setDragOverDay(null); fetchData()
  }

  if (loading) return <PageSpinner />

  const totalPosted  = thisMonthSlots.filter(s => s.status === 'posted').length
  const totalScheduled = thisMonthSlots.length

  // ── Per-client stats ───────────────────────────────────────────────────────
  function clientStats(clientSlots: PostSlot[], target?: number | null) {
    const scheduled = clientSlots.length
    const posted    = clientSlots.filter(s => s.status === 'posted').length
    const remaining = clientSlots.filter(s => s.status === 'scheduled').length
    const pct       = scheduled > 0 ? Math.round((posted / scheduled) * 100) : 0
    const onTrack   = target ? posted + remaining >= target : null
    return { scheduled, posted, remaining, pct, onTrack }
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ── */}
      <div className="px-6 py-4 border-b border-[#2e2e2e] flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-semibold text-[#e8e8e8]">Post Schedule</h1>
            <p className="text-xs text-[#888] mt-0.5">
              {totalPosted}/{totalScheduled} posted · {monthName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex bg-[#191919] border border-[#2e2e2e] rounded-card p-0.5">
              <button onClick={() => setViewMode('calendar')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-chip text-xs font-medium transition-colors ${viewMode === 'calendar' ? 'bg-[#202020] text-[#e8e8e8]' : 'text-[#555] hover:text-[#888]'}`}>
                <CalendarDays size={12} /> Calendar
              </button>
              <button onClick={() => setViewMode('stats')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-chip text-xs font-medium transition-colors ${viewMode === 'stats' ? 'bg-[#202020] text-[#e8e8e8]' : 'text-[#555] hover:text-[#888]'}`}>
                <BarChart2 size={12} /> Stats
              </button>
            </div>

            {/* Month nav */}
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrent(new Date(year, month - 1, 1))} className="p-1.5 rounded-card text-[#888] hover:text-[#e8e8e8] hover:bg-[#252525]"><ChevronLeft size={15} /></button>
              <span className="text-sm font-medium text-[#e8e8e8] min-w-[130px] text-center">{monthName}</span>
              <button onClick={() => setCurrent(new Date(year, month + 1, 1))} className="p-1.5 rounded-card text-[#888] hover:text-[#e8e8e8] hover:bg-[#252525]"><ChevronRight size={15} /></button>
            </div>

            {/* Client filter (calendar only) */}
            {viewMode === 'calendar' && (
              <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
                className="px-3 py-1.5 rounded-card bg-[#191919] border border-[#2e2e2e] text-[#888] text-xs focus:outline-none">
                <option value="all">All Clients</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Top-level month counters */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: `${current.toLocaleString('default', { month: 'short' })} Scheduled`, value: totalScheduled, color: '#888' },
            { label: 'Posted', value: totalPosted, color: '#10b981' },
            { label: 'MTD Posted', value: mtdSlots.filter(s => s.status === 'posted').length, color: '#4f8ef7' },
            { label: `${prevMonth.toLocaleString('default', { month: 'short' })} + ${current.toLocaleString('default', { month: 'short' })}`,
              value: prevMonthSlots.filter(s => s.status === 'posted').length + totalPosted, color: '#a855f7' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-[#191919] border border-[#2e2e2e] rounded-card px-3 py-2 flex items-center justify-between">
              <span className="text-[11px] text-[#555]">{label}</span>
              <span className="text-lg font-semibold" style={{ color }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Calendar View ── */}
      {viewMode === 'calendar' && (
        <>
          {/* Client legend */}
          <div className="flex flex-wrap gap-3 px-6 py-2 border-b border-[#2e2e2e] flex-shrink-0">
            {clients.map(c => (
              <div key={c.id} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: c.color }} />
                <span className="text-[10px] text-[#555]">{c.name}</span>
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-7 gap-px bg-[#2e2e2e] rounded-card overflow-hidden">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} className="bg-[#191919] px-2 py-2 text-center text-[10px] font-medium text-[#555] uppercase tracking-wide">{d}</div>
              ))}

              {cells.map((day, i) => {
                const daySlots = day ? (visibleSlots[day] ?? []) : []
                const dateStr  = day ? `${year}-${pad(month + 1)}-${pad(day)}` : ''
                const isToday  = dateStr === todayStr
                const isOver   = dragOverDay === day

                return (
                  <div key={i}
                    className={`bg-[#202020] min-h-[120px] p-1.5 flex flex-col transition-colors ${isOver && draggingId ? 'bg-[#4f8ef7]/10 ring-1 ring-inset ring-[#4f8ef7]/40' : ''}`}
                    onDragOver={day ? e => onDragOver(e, day) : undefined}
                    onDragLeave={() => setDragOverDay(null)}
                    onDrop={day ? () => onDrop(day) : undefined}
                  >
                    {day && (
                      <>
                        {/* Day number + always-visible + button */}
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`text-xs font-semibold ${isToday ? 'text-white bg-[#4f8ef7] w-5 h-5 rounded-full flex items-center justify-center text-[10px]' : 'text-[#888]'}`}>
                            {day}
                          </span>
                          <button
                            onClick={() => { setAddingDay(day); setAddForm({ client_id: clients[0]?.id ?? '', label: '' }) }}
                            className="w-5 h-5 rounded flex items-center justify-center text-[#555] hover:text-[#4f8ef7] hover:bg-[#4f8ef7]/10 transition-colors"
                          >
                            <Plus size={11} />
                          </button>
                        </div>

                        {/* Quick-add form */}
                        {addingDay === day && (
                          <div className="mb-1.5 p-1.5 bg-[#191919] rounded-card border border-[#3a3a3a] space-y-1">
                            <select value={addForm.client_id} onChange={e => setAddForm(p => ({ ...p, client_id: e.target.value }))}
                              className="w-full px-1.5 py-1 rounded bg-[#252525] border border-[#2e2e2e] text-[#e8e8e8] text-[10px] focus:outline-none">
                              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <input type="text" value={addForm.label}
                              onChange={e => setAddForm(p => ({ ...p, label: e.target.value }))}
                              placeholder="Label (optional)"
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') quickAdd(); if (e.key === 'Escape') setAddingDay(null) }}
                              className="w-full px-1.5 py-1 rounded bg-[#252525] border border-[#2e2e2e] text-[#e8e8e8] text-[10px] focus:outline-none placeholder-[#555]"
                            />
                            <div className="flex gap-1">
                              <button onClick={quickAdd} className="flex-1 py-0.5 rounded bg-[#4f8ef7] text-white text-[10px] font-medium">Add</button>
                              <button onClick={() => setAddingDay(null)} className="px-2 py-0.5 rounded bg-[#2e2e2e] text-[#555] text-[10px]">✕</button>
                            </div>
                          </div>
                        )}

                        {/* Post slots */}
                        <div className="flex-1 space-y-0.5">
                          {daySlots.map(slot => {
                            const client = clientMap[slot.client_id]
                            return (
                              <div key={slot.id} draggable
                                onDragStart={e => onDragStart(e, slot.id)}
                                onDragEnd={() => { setDraggingId(null); setDragOverDay(null) }}
                                className={`group flex items-center gap-1 px-1.5 py-0.5 rounded-chip cursor-grab active:cursor-grabbing select-none transition-opacity ${draggingId === slot.id ? 'opacity-30' : ''}`}
                                style={{ backgroundColor: client ? `${client.color}22` : '#2e2e2e' }}
                              >
                                {/* Posted indicator */}
                                <button onClick={e => { e.stopPropagation(); togglePosted(slot) }}
                                  title={slot.status === 'posted' ? 'Mark unposted' : 'Mark posted'}
                                  className="flex-shrink-0 transition-colors"
                                >
                                  <div className={`w-3 h-3 rounded-sm border flex items-center justify-center transition-colors ${
                                    slot.status === 'posted'
                                      ? 'bg-[#10b981] border-[#10b981]'
                                      : 'border-[#3a3a3a] hover:border-[#10b981]'
                                  }`}>
                                    {slot.status === 'posted' && <Check size={7} className="text-white" />}
                                  </div>
                                </button>

                                <span className={`text-[10px] font-medium flex-1 truncate ${slot.status === 'posted' ? 'line-through opacity-50' : ''}`}
                                  style={{ color: client?.color || '#888' }}>
                                  {slot.label || client?.name?.split(' ')[0] || 'Post'}
                                </span>

                                <button onClick={e => { e.stopPropagation(); deleteSlot(slot.id) }}
                                  className="opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity">
                                  <X size={9} className="text-[#555] hover:text-[#ef4444]" />
                                </button>
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
        </>
      )}

      {/* ── Stats View ── */}
      {viewMode === 'stats' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Per-client breakdown */}
          <div>
            <h2 className="text-sm font-semibold text-[#e8e8e8] mb-3 flex items-center gap-2">
              <TrendingUp size={14} className="text-[#4f8ef7]" />
              Per Client — {monthName}
            </h2>
            <div className="space-y-2">
              {clients.map(client => {
                const cThis = thisMonthSlots.filter(s => s.client_id === client.id)
                const cPrev = prevMonthSlots.filter(s => s.client_id === client.id)
                const stats = clientStats(cThis, client.monthly_target)
                const prevStats = clientStats(cPrev)
                const target = client.monthly_target

                return (
                  <div key={client.id} className="bg-[#202020] border border-[#2e2e2e] rounded-card p-4">
                    <div className="flex items-start gap-3">
                      {/* Color bar */}
                      <div className="w-1 self-stretch rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: client.color }} />

                      <div className="flex-1 min-w-0">
                        {/* Client name + on-track badge */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-semibold text-[#e8e8e8]">{client.name}</span>
                          {target && stats.onTrack !== null && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${stats.onTrack ? 'bg-[#0d3d2a] text-[#10b981]' : 'bg-[#3d1a1a] text-[#ef4444]'}`}>
                              {stats.onTrack ? '✓ On Track' : '⚠ Behind'}
                            </span>
                          )}
                        </div>

                        {/* Stats grid */}
                        <div className="grid grid-cols-5 gap-2 mb-3">
                          {[
                            { label: 'Scheduled', value: stats.scheduled, color: '#888' },
                            { label: 'Posted', value: stats.posted, color: '#10b981' },
                            { label: 'Remaining', value: stats.remaining, color: '#f59e0b' },
                            { label: 'Prev Month', value: prevStats.posted + '/' + prevStats.scheduled, color: '#555' },
                            { label: 'Combined', value: prevStats.posted + stats.posted, color: '#a855f7' },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="text-center">
                              <p className="text-[10px] text-[#555] mb-0.5">{label}</p>
                              <p className="text-base font-semibold" style={{ color }}>{value}</p>
                            </div>
                          ))}
                        </div>

                        {/* Progress bar */}
                        {stats.scheduled > 0 && (
                          <div className="mb-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-[#555]">Posted this month</span>
                              <span className="text-[10px] text-[#555]">{stats.posted}/{stats.scheduled} ({stats.pct}%)</span>
                            </div>
                            <div className="h-1.5 bg-[#2e2e2e] rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${stats.pct}%`, backgroundColor: client.color }} />
                            </div>
                          </div>
                        )}

                        {/* Contract target */}
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] text-[#555]">Monthly contract target:</span>
                          <input
                            type="number"
                            min={0}
                            max={99}
                            defaultValue={client.monthly_target ?? ''}
                            placeholder="—"
                            onBlur={e => {
                              const val = parseInt(e.target.value)
                              if (!isNaN(val) && val !== client.monthly_target) saveMonthlyTarget(client.id, val)
                            }}
                            className="w-14 px-2 py-0.5 rounded bg-[#191919] border border-[#2e2e2e] text-[#e8e8e8] text-xs text-center focus:outline-none focus:border-[#4f8ef7] transition-colors"
                          />
                          {savingTarget === client.id && <span className="text-[10px] text-[#4f8ef7]">Saved</span>}
                          {target && stats.scheduled > 0 && (
                            <span className={`text-[10px] ${stats.remaining + stats.posted >= target ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                              {stats.posted}/{target} of target
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Monthly summary comparison table */}
          <div>
            <h2 className="text-sm font-semibold text-[#e8e8e8] mb-3 flex items-center gap-2">
              <BarChart2 size={14} className="text-[#a855f7]" />
              Monthly Summary
            </h2>
            <div className="bg-[#202020] border border-[#2e2e2e] rounded-card overflow-hidden">
              <div className="grid bg-[#191919] border-b border-[#2e2e2e]" style={{ gridTemplateColumns: '1fr 80px 80px 80px 80px 80px' }}>
                {['Client', 'Target', `${prevMonth.toLocaleString('default',{month:'short'})} Posted`, `${current.toLocaleString('default',{month:'short'})} Sched`, `${current.toLocaleString('default',{month:'short'})} Posted`, 'MTD'].map(h => (
                  <div key={h} className="px-3 py-2 text-[10px] font-semibold text-[#555] uppercase tracking-wide text-center first:text-left">{h}</div>
                ))}
              </div>
              {clients.map((client, idx) => {
                const cThis = thisMonthSlots.filter(s => s.client_id === client.id)
                const cPrev = prevMonthSlots.filter(s => s.client_id === client.id)
                const cMtd  = mtdSlots.filter(s => s.client_id === client.id)
                const prevPosted = cPrev.filter(s => s.status === 'posted').length
                const thisPosted = cThis.filter(s => s.status === 'posted').length
                const mtdPosted  = cMtd.filter(s => s.status === 'posted').length
                const target = client.monthly_target
                const behind = target && thisPosted < target && cThis.filter(s => s.status === 'scheduled').length + thisPosted < target

                return (
                  <div key={client.id}
                    className={`grid items-center ${idx < clients.length - 1 ? 'border-b border-[#1e1e1e]' : ''} hover:bg-[#252525] transition-colors`}
                    style={{ gridTemplateColumns: '1fr 80px 80px 80px 80px 80px' }}>
                    <div className="px-3 py-2.5 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: client.color }} />
                      <span className="text-sm text-[#e8e8e8] truncate">{client.name}</span>
                      {behind && <AlertCircle size={11} className="text-[#ef4444] flex-shrink-0" />}
                    </div>
                    <div className="px-3 py-2.5 text-center text-sm text-[#555]">{target ?? '—'}</div>
                    <div className="px-3 py-2.5 text-center text-sm text-[#888]">{prevPosted}/{cPrev.length}</div>
                    <div className="px-3 py-2.5 text-center text-sm text-[#888]">{cThis.length}</div>
                    <div className="px-3 py-2.5 text-center">
                      <span className={`text-sm font-medium ${target ? (thisPosted >= target ? 'text-[#10b981]' : 'text-[#f59e0b]') : 'text-[#888]'}`}>
                        {thisPosted}
                      </span>
                    </div>
                    <div className="px-3 py-2.5 text-center text-sm text-[#4f8ef7]">{mtdPosted}</div>
                  </div>
                )
              })}
              {/* Totals row */}
              <div className="grid bg-[#191919] border-t border-[#2e2e2e]" style={{ gridTemplateColumns: '1fr 80px 80px 80px 80px 80px' }}>
                <div className="px-3 py-2 text-xs font-semibold text-[#555]">TOTAL</div>
                <div className="px-3 py-2 text-center text-xs font-semibold text-[#555]">
                  {clients.reduce((sum, c) => sum + (c.monthly_target ?? 0), 0) || '—'}
                </div>
                <div className="px-3 py-2 text-center text-xs font-semibold text-[#888]">
                  {prevMonthSlots.filter(s => s.status === 'posted').length}/{prevMonthSlots.length}
                </div>
                <div className="px-3 py-2 text-center text-xs font-semibold text-[#888]">{totalScheduled}</div>
                <div className="px-3 py-2 text-center text-xs font-semibold text-[#10b981]">{totalPosted}</div>
                <div className="px-3 py-2 text-center text-xs font-semibold text-[#4f8ef7]">
                  {mtdSlots.filter(s => s.status === 'posted').length}
                </div>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
