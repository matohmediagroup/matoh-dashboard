'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, List, CalendarDays, ChevronLeft, ChevronRight, MapPin, Clock, Pencil, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { logActivity } from '@/lib/activity'
import type { Shoot, Client } from '@/types/database'

type View = 'list' | 'calendar'

export default function VideographerPage() {
  const supabase = createClient()
  const [view, setView] = useState<View>('list')
  const [shoots, setShoots] = useState<Shoot[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editShoot, setEditShoot] = useState<Shoot | null>(null)
  const [saving, setSaving] = useState(false)
  const [calMonth, setCalMonth] = useState(new Date())
  const [form, setForm] = useState({ client_id: '', shoot_date: '', shoot_time: '', location: '', notes: '' })

  const fetchData = useCallback(async () => {
    const [{ data: shootsData }, { data: clientsData }] = await Promise.all([
      supabase.from('shoots').select('*').order('shoot_date'),
      supabase.from('clients').select('*').order('name'),
    ])
    setShoots(shootsData ?? [])
    setClients(clientsData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]))

  async function saveShoot() {
    if (!form.shoot_date) return
    setSaving(true)
    const payload = {
      client_id: form.client_id || null,
      shoot_date: form.shoot_date,
      shoot_time: form.shoot_time || null,
      location: form.location || null,
      notes: form.notes || null,
    }
    if (editShoot) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('shoots') as any).update(payload).eq('id', editShoot.id)
      await logActivity('shoot_updated', `Shoot updated for ${clientMap[form.client_id]?.name ?? 'Unknown'}`, 'shoot', editShoot.id)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from('shoots') as any).insert(payload).select().single()
      if (data) await logActivity('shoot_created', `New shoot added for ${clientMap[form.client_id]?.name ?? 'Unknown'} on ${form.shoot_date}`, 'shoot', data.id)
    }
    setSaving(false)
    setShowAdd(false)
    setEditShoot(null)
    resetForm()
    fetchData()
  }

  async function deleteShoot(id: string) {
    await supabase.from('shoots').delete().eq('id', id)
    fetchData()
  }

  function resetForm() {
    setForm({ client_id: '', shoot_date: '', shoot_time: '', location: '', notes: '' })
  }

  function openEdit(s: Shoot) {
    setEditShoot(s)
    setForm({ client_id: s.client_id ?? '', shoot_date: s.shoot_date, shoot_time: s.shoot_time ?? '', location: s.location ?? '', notes: s.notes ?? '' })
    setShowAdd(true)
  }

  if (loading) return <PageSpinner />

  const upcomingShoots = shoots.filter(s => new Date(s.shoot_date) >= new Date(new Date().toDateString()))
  const now = new Date()
  const year = calMonth.getFullYear()
  const month = calMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const calCells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const shootsByDay: Record<number, Shoot[]> = {}
  shoots.forEach(s => {
    const d = new Date(s.shoot_date)
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate()
      if (!shootsByDay[day]) shootsByDay[day] = []
      shootsByDay[day].push(s)
    }
  })

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2e2e2e] flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-[#e8e8e8]">Shoot Schedule</h1>
          <Link href="/videographer/scripts" className="text-sm text-[#888] hover:text-[#4f8ef7] transition-colors">Scripts →</Link>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-[#191919] border border-[#2e2e2e] rounded-card p-0.5">
            {([{ id: 'list', icon: List }, { id: 'calendar', icon: CalendarDays }] as const).map(({ id, icon: Icon }) => (
              <button key={id} onClick={() => setView(id)}
                className={`px-3 py-1.5 rounded-chip text-xs font-medium transition-colors flex items-center gap-1.5 ${view === id ? 'bg-[#202020] text-[#e8e8e8]' : 'text-[#888] hover:text-[#e8e8e8]'}`}>
                <Icon size={13} /> {id.charAt(0).toUpperCase() + id.slice(1)}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => { resetForm(); setEditShoot(null); setShowAdd(true) }}>
            <Plus size={14} /> Add Shoot
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {view === 'list' ? (
          <div>
            {upcomingShoots.length === 0 ? (
              <div className="text-center py-20 text-[#888] text-sm">No upcoming shoots.</div>
            ) : (
              <div className="space-y-2">
                {upcomingShoots.map(shoot => {
                  const client = shoot.client_id ? clientMap[shoot.client_id] : null
                  return (
                    <div key={shoot.id} className="bg-[#202020] border border-[#2e2e2e] rounded-card p-4 flex items-center gap-4">
                      {client && <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: client.color }} />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-[#e8e8e8]">
                            {new Date(shoot.shoot_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          {shoot.shoot_time && (
                            <span className="flex items-center gap-1 text-xs text-[#888]">
                              <Clock size={11} /> {shoot.shoot_time.slice(0, 5)}
                            </span>
                          )}
                          {client && <Badge color={client.color} label={client.name} />}
                        </div>
                        {shoot.location && (
                          <p className="flex items-center gap-1 text-xs text-[#888]">
                            <MapPin size={11} /> {shoot.location}
                          </p>
                        )}
                        {shoot.notes && <p className="text-xs text-[#555] mt-1 truncate">{shoot.notes}</p>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => openEdit(shoot)} className="p-1.5 rounded-card text-[#888] hover:text-[#e8e8e8] hover:bg-[#252525]"><Pencil size={13} /></button>
                        <button onClick={() => deleteShoot(shoot.id)} className="p-1.5 rounded-card text-[#888] hover:text-[#ef4444] hover:bg-[#252525]"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-4 mb-4">
              <button onClick={() => setCalMonth(new Date(year, month - 1, 1))} className="p-1.5 rounded-card text-[#888] hover:text-[#e8e8e8] hover:bg-[#252525]"><ChevronLeft size={16} /></button>
              <h2 className="text-sm font-semibold text-[#e8e8e8] min-w-[140px] text-center">
                {calMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </h2>
              <button onClick={() => setCalMonth(new Date(year, month + 1, 1))} className="p-1.5 rounded-card text-[#888] hover:text-[#e8e8e8] hover:bg-[#252525]"><ChevronRight size={16} /></button>
            </div>
            <div className="grid grid-cols-7 gap-px bg-[#2e2e2e] rounded-card overflow-hidden">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} className="bg-[#191919] px-2 py-2 text-center text-[10px] font-medium text-[#888] uppercase tracking-wide">{d}</div>
              ))}
              {calCells.map((day, i) => (
                <div key={i} className="bg-[#202020] min-h-[80px] p-1.5">
                  {day && (
                    <>
                      <p className="text-xs text-[#888] mb-1">{day}</p>
                      {(shootsByDay[day] ?? []).map(s => {
                        const c = s.client_id ? clientMap[s.client_id] : null
                        return (
                          <button key={s.id} onClick={() => openEdit(s)}
                            className="w-full text-left px-1.5 py-0.5 rounded-chip text-[10px] font-medium truncate mb-0.5"
                            style={{ backgroundColor: c ? `${c.color}30` : '#2e2e2e', color: c ? c.color : '#888' }}>
                            {c ? c.name.split(' ')[0] : 'Shoot'}
                          </button>
                        )
                      })}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Modal open={showAdd} onClose={() => { setShowAdd(false); setEditShoot(null) }} title={editShoot ? 'Edit Shoot' : 'Add Shoot'}>
        <div className="space-y-3">
          <Select label="Client" value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}>
            <option value="">No client</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Date *" type="date" value={form.shoot_date} onChange={e => setForm(p => ({ ...p, shoot_date: e.target.value }))} />
            <Input label="Time" type="time" value={form.shoot_time} onChange={e => setForm(p => ({ ...p, shoot_time: e.target.value }))} />
          </div>
          <Input label="Location" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Address or venue" />
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setShowAdd(false); setEditShoot(null) }}>Cancel</Button>
            <Button onClick={saveShoot} disabled={saving || !form.shoot_date}>
              {saving ? 'Saving…' : editShoot ? 'Save Changes' : 'Add Shoot'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
