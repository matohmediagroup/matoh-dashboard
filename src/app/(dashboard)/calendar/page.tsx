'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, ChevronLeft, ChevronRight, MapPin, Clock, Video, Phone } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import type { CalendarEvent, Shoot, Client } from '@/types/database'

type UnifiedEvent =
  | { kind: 'shoot'; data: Shoot; client: Client | null }
  | { kind: 'event'; data: CalendarEvent; client: Client | null }

export default function CalendarPage() {
  const supabase = createClient()
  const [current, setCurrent] = useState(new Date())
  const [shoots, setShoots] = useState<Shoot[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', event_type: 'meeting', client_id: '', event_date: '', event_time: '', notes: '' })

  const fetchData = useCallback(async () => {
    const [{ data: shootsData }, { data: eventsData }, { data: clientsData }] = await Promise.all([
      supabase.from('shoots').select('*'),
      supabase.from('calendar_events').select('*'),
      supabase.from('clients').select('*').order('name'),
    ])
    setShoots(shootsData ?? [])
    setEvents(eventsData ?? [])
    setClients(clientsData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]))

  async function addEvent() {
    if (!form.title.trim() || !form.event_date) return
    setSaving(true)
    const eventType = (form.event_type || 'meeting') as 'meeting' | 'call' | 'other'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('calendar_events') as any).insert({
      title: form.title,
      event_type: eventType,
      client_id: form.client_id || null,
      event_date: form.event_date,
      event_time: form.event_time || null,
      notes: form.notes || null,
    })
    setSaving(false)
    setShowAdd(false)
    setForm({ title: '', event_type: 'meeting', client_id: '', event_date: '', event_time: '', notes: '' })
    fetchData()
  }

  if (loading) return <PageSpinner />

  const year = current.getFullYear()
  const month = current.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  const allEventsByDay: Record<number, UnifiedEvent[]> = {}

  shoots.forEach(s => {
    const d = new Date(s.shoot_date)
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate()
      if (!allEventsByDay[day]) allEventsByDay[day] = []
      allEventsByDay[day].push({ kind: 'shoot', data: s, client: s.client_id ? clientMap[s.client_id] ?? null : null })
    }
  })

  events.forEach(e => {
    const d = new Date(e.event_date)
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate()
      if (!allEventsByDay[day]) allEventsByDay[day] = []
      allEventsByDay[day].push({ kind: 'event', data: e, client: e.client_id ? clientMap[e.client_id] ?? null : null })
    }
  })

  const monthName = current.toLocaleString('default', { month: 'long', year: 'numeric' })

  // Upcoming events list (next 30 days)
  const today = new Date()
  const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
  const upcoming: UnifiedEvent[] = [
    ...shoots.filter(s => { const d = new Date(s.shoot_date); return d >= today && d <= in30 }).map(s => ({ kind: 'shoot' as const, data: s, client: s.client_id ? clientMap[s.client_id] ?? null : null })),
    ...events.filter(e => { const d = new Date(e.event_date); return d >= today && d <= in30 }).map(e => ({ kind: 'event' as const, data: e, client: e.client_id ? clientMap[e.client_id] ?? null : null })),
  ].sort((a, b) => {
    const da = a.kind === 'shoot' ? a.data.shoot_date : a.data.event_date
    const db = b.kind === 'shoot' ? b.data.shoot_date : b.data.event_date
    return da.localeCompare(db)
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-[#e8e8e8]">Agency Calendar</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-[#888]">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#4f8ef7]" /> Shoots</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#8b5cf6]" /> Meetings/Calls</span>
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)}><Plus size={14} /> Add Event</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="xl:col-span-2">
          <div className="flex items-center gap-4 mb-4">
            <button onClick={() => setCurrent(new Date(year, month - 1, 1))} className="p-1.5 rounded-card text-[#888] hover:text-[#e8e8e8] hover:bg-[#252525]"><ChevronLeft size={16} /></button>
            <h2 className="text-sm font-semibold text-[#e8e8e8] min-w-[140px] text-center">{monthName}</h2>
            <button onClick={() => setCurrent(new Date(year, month + 1, 1))} className="p-1.5 rounded-card text-[#888] hover:text-[#e8e8e8] hover:bg-[#252525]"><ChevronRight size={16} /></button>
          </div>
          <div className="grid grid-cols-7 gap-px bg-[#2e2e2e] rounded-card overflow-hidden">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="bg-[#191919] px-2 py-2 text-center text-[10px] font-medium text-[#888] uppercase tracking-wide">{d}</div>
            ))}
            {cells.map((day, i) => {
              const isToday = day === today.getDate() && year === today.getFullYear() && month === today.getMonth()
              return (
                <div key={i} className="bg-[#202020] min-h-[90px] p-1.5">
                  {day && (
                    <>
                      <p className={`text-xs mb-1 w-5 h-5 flex items-center justify-center rounded-full ${isToday ? 'bg-[#4f8ef7] text-white' : 'text-[#888]'}`}>{day}</p>
                      {(allEventsByDay[day] ?? []).map((ev, j) => {
                        if (ev.kind === 'shoot') {
                          const color = ev.client?.color ?? '#4f8ef7'
                          return (
                            <div key={j} className="px-1.5 py-0.5 rounded-chip text-[10px] font-medium truncate mb-0.5 flex items-center gap-1"
                              style={{ backgroundColor: `${color}25`, color }}>
                              <Video size={8} />
                              {ev.client?.name.split(' ')[0] ?? 'Shoot'}
                            </div>
                          )
                        }
                        const evColor = ev.client?.color ?? '#8b5cf6'
                        return (
                          <div key={j} className="px-1.5 py-0.5 rounded-chip text-[10px] font-medium truncate mb-0.5 flex items-center gap-1"
                            style={{ backgroundColor: `${evColor}22`, color: evColor }}>
                            <Phone size={8} />
                            {ev.data.title}
                          </div>
                        )
                      })}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Upcoming sidebar */}
        <div>
          <h2 className="text-sm font-semibold text-[#888] uppercase tracking-wide mb-3">Next 30 Days</h2>
          <div className="space-y-2">
            {upcoming.length === 0 && <p className="text-sm text-[#555]">Nothing scheduled.</p>}
            {upcoming.map((ev, i) => {
              const isShoot = ev.kind === 'shoot'
              const date = isShoot ? ev.data.shoot_date : ev.data.event_date
              const time = isShoot ? ev.data.shoot_time : ev.data.event_time
              const color = isShoot ? (ev.client?.color ?? '#4f8ef7') : (ev.client?.color ?? '#8b5cf6')
              const title = isShoot ? (ev.client?.name ?? 'Shoot') : ev.data.title
              return (
                <div key={i} className="rounded-card p-3 flex gap-3 border" style={{ backgroundColor: `${color}11`, borderColor: `${color}33` }}>
                  <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {isShoot ? <Video size={11} className="text-[#888]" /> : <Phone size={11} className="text-[#888]" />}
                      <span className="text-xs font-medium text-[#e8e8e8]">{title}</span>
                    </div>
                    <p className="text-[10px] text-[#888]">
                      {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {time && ` · ${time.slice(0, 5)}`}
                    </p>
                    {isShoot && ev.data.location && (
                      <p className="flex items-center gap-1 text-[10px] text-[#555] mt-0.5"><MapPin size={9} />{ev.data.location}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Event">
        <div className="space-y-3">
          <Input label="Title *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Meeting title" />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Type" value={form.event_type} onChange={e => setForm(p => ({ ...p, event_type: e.target.value }))}>
              <option value="meeting">Meeting</option>
              <option value="call">Call</option>
            </Select>
            <Select label="Client" value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}>
              <option value="">No client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Date *" type="date" value={form.event_date} onChange={e => setForm(p => ({ ...p, event_date: e.target.value }))} />
            <Input label="Time" type="time" value={form.event_time} onChange={e => setForm(p => ({ ...p, event_time: e.target.value }))} />
          </div>
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={addEvent} disabled={saving || !form.title.trim() || !form.event_date}>
              {saving ? 'Saving…' : 'Add Event'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
