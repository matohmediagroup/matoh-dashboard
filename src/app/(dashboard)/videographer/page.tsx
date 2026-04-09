'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, List, CalendarDays, ChevronLeft, ChevronRight, MapPin, Clock, Pencil, Trash2, ChevronDown, ChevronRight as ChevronRightIcon, Check, Upload, FileText, Loader, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { logActivity } from '@/lib/activity'
import type { Shoot, Client } from '@/types/database'

type View = 'list' | 'calendar'

interface ShootScript {
  id: string
  shoot_id: string
  content: string
  order_num: number
  done: boolean
}

interface ShootWithPdf extends Shoot {
  pdf_url?: string
  pdf_name?: string
}

export default function VideographerPage() {
  const supabase = createClient()
  const [view, setView]           = useState<View>('list')
  const [shoots, setShoots]       = useState<ShootWithPdf[]>([])
  const [clients, setClients]     = useState<Client[]>([])
  const [scripts, setScripts]     = useState<Record<string, ShootScript[]>>({})
  const [expanded, setExpanded]   = useState<Record<string, boolean>>({})
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [editShoot, setEditShoot] = useState<ShootWithPdf | null>(null)
  const [saving, setSaving]       = useState(false)
  const [calMonth, setCalMonth]   = useState(new Date())
  const [form, setForm] = useState({ client_id: '', shoot_date: '', shoot_time: '', location: '', notes: '' })
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const fetchData = useCallback(async () => {
    const [{ data: shootsData }, { data: clientsData }, { data: scriptsData }] = await Promise.all([
      supabase.from('shoots').select('*').order('shoot_date'),
      supabase.from('clients').select('*').order('name'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from('shoot_scripts') as any).select('*').order('order_num'),
    ])
    setShoots(shootsData ?? [])
    setClients(clientsData ?? [])
    const grouped: Record<string, ShootScript[]> = {}
    ;(scriptsData ?? []).forEach((s: ShootScript) => {
      if (!grouped[s.shoot_id]) grouped[s.shoot_id] = []
      grouped[s.shoot_id].push(s)
    })
    setScripts(grouped)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]))

  // ── Shoot CRUD ─────────────────────────────────────────────────────────────

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
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from('shoots') as any).insert(payload).select().single()
      if (data) await logActivity('shoot_created', `New shoot for ${clientMap[form.client_id]?.name ?? 'Unknown'} on ${form.shoot_date}`, 'shoot', data.id)
    }
    setSaving(false)
    setShowAdd(false)
    setEditShoot(null)
    setForm({ client_id: '', shoot_date: '', shoot_time: '', location: '', notes: '' })
    fetchData()
  }

  async function deleteShoot(id: string) {
    if (!confirm('Delete this shoot and all its scripts?')) return
    await supabase.from('shoots').delete().eq('id', id)
    fetchData()
  }

  function openEdit(s: ShootWithPdf) {
    setEditShoot(s)
    setForm({ client_id: s.client_id ?? '', shoot_date: s.shoot_date, shoot_time: s.shoot_time ?? '', location: s.location ?? '', notes: s.notes ?? '' })
    setShowAdd(true)
  }

  // ── PDF Upload ─────────────────────────────────────────────────────────────

  async function handlePdfUpload(shootId: string, file: File) {
    setUploading(p => ({ ...p, [shootId]: true }))
    setExpanded(p => ({ ...p, [shootId]: true }))
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('shoot_id', shootId)
      const res = await fetch('/api/shoots/upload-pdf', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        alert(`Upload failed: ${data.error}`)
      } else {
        await fetchData()
      }
    } finally {
      setUploading(p => ({ ...p, [shootId]: false }))
    }
  }

  // ── Script toggle ──────────────────────────────────────────────────────────

  async function toggleScript(script: ShootScript) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('shoot_scripts') as any).update({ done: !script.done }).eq('id', script.id)
    setScripts(prev => {
      const updated = { ...prev }
      updated[script.shoot_id] = updated[script.shoot_id].map(s =>
        s.id === script.id ? { ...s, done: !s.done } : s
      )
      return updated
    })
  }

  function toggleExpand(id: string) {
    setExpanded(p => ({ ...p, [id]: !p[id] }))
  }

  if (loading) return <PageSpinner />

  const upcomingShoots = shoots.filter(s => new Date(s.shoot_date) >= new Date(new Date().toDateString()))

  // Calendar
  const year = calMonth.getFullYear()
  const month = calMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const calCells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const shootsByDay: Record<number, ShootWithPdf[]> = {}
  shoots.forEach(s => {
    const d = new Date(s.shoot_date)
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate()
      if (!shootsByDay[day]) shootsByDay[day] = []
      shootsByDay[day].push(s)
    }
  })

  // ── Shoot card ─────────────────────────────────────────────────────────────

  function renderShootCard(shoot: ShootWithPdf) {
    const client = shoot.client_id ? clientMap[shoot.client_id] : null
    const shootScripts = scripts[shoot.id] ?? []
    const isExpanded = expanded[shoot.id]
    const isUploading = uploading[shoot.id]
    const doneCount = shootScripts.filter(s => s.done).length
    const progress = shootScripts.length > 0 ? Math.round((doneCount / shootScripts.length) * 100) : 0

    return (
      <div key={shoot.id} className="bg-[#202020] border border-[#2e2e2e] rounded-card overflow-hidden">

        {/* Header row */}
        <div className="flex items-center gap-3 px-4 py-3">
          {client && <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: client.color }} />}

          <button onClick={() => toggleExpand(shoot.id)} className="flex-shrink-0 text-[#555] hover:text-[#888] transition-colors">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRightIcon size={14} />}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="text-sm font-medium text-[#e8e8e8]">
                {new Date(shoot.shoot_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
              {shoot.shoot_time && (
                <span className="flex items-center gap-1 text-xs text-[#888]"><Clock size={11} />{shoot.shoot_time.slice(0, 5)}</span>
              )}
              {client && <Badge color={client.color} label={client.name} />}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {shoot.location && <p className="flex items-center gap-1 text-xs text-[#555]"><MapPin size={10} />{shoot.location}</p>}
              {shoot.pdf_name && <p className="flex items-center gap-1 text-xs text-[#555]"><FileText size={10} />{shoot.pdf_name}</p>}
              {shootScripts.length > 0 && (
                <p className="text-xs text-[#555]">{doneCount}/{shootScripts.length} done</p>
              )}
            </div>
          </div>

          {/* Progress bar — only when has scripts */}
          {shootScripts.length > 0 && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-20 h-1.5 bg-[#2e2e2e] rounded-full overflow-hidden">
                <div className="h-full bg-[#10b981] rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-[10px] text-[#555] w-8 text-right">{progress}%</span>
            </div>
          )}

          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Upload PDF button */}
            <button
              onClick={() => fileInputRefs.current[shoot.id]?.click()}
              disabled={isUploading}
              title="Upload script PDF"
              className="p-1.5 rounded-card text-[#888] hover:text-[#4f8ef7] hover:bg-[#252525] transition-colors disabled:opacity-40"
            >
              {isUploading ? <Loader size={13} className="animate-spin" /> : <Upload size={13} />}
            </button>
            <input
              ref={el => { fileInputRefs.current[shoot.id] = el }}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(shoot.id, f); e.target.value = '' }}
            />
            <button onClick={() => openEdit(shoot)} className="p-1.5 rounded-card text-[#888] hover:text-[#e8e8e8] hover:bg-[#252525]"><Pencil size={13} /></button>
            <button onClick={() => deleteShoot(shoot.id)} className="p-1.5 rounded-card text-[#888] hover:text-[#ef4444] hover:bg-[#252525]"><Trash2 size={13} /></button>
          </div>
        </div>

        {/* Expanded scripts section */}
        {isExpanded && (
          <div className="border-t border-[#2e2e2e]">

            {/* Scripts header */}
            <div className="px-4 py-2.5 bg-[#191919] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={12} className="text-[#555]" />
                <span className="text-[10px] font-semibold text-[#555] uppercase tracking-wide">
                  {shoot.pdf_name ? 'Script Sections' : 'Shot List'}
                </span>
                {shootScripts.length > 0 && (
                  <span className="text-[10px] text-[#3a3a3a]">{doneCount} / {shootScripts.length} completed</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {shoot.pdf_url && (
                  <a href={shoot.pdf_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-[#4f8ef7] hover:text-[#3a7de8] transition-colors">
                    <ExternalLink size={10} /> View PDF
                  </a>
                )}
                <button
                  onClick={() => fileInputRefs.current[shoot.id]?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-1 text-[10px] text-[#555] hover:text-[#888] transition-colors disabled:opacity-40"
                >
                  {isUploading
                    ? <><Loader size={10} className="animate-spin" /> Parsing…</>
                    : <><Upload size={10} /> {shoot.pdf_url ? 'Replace PDF' : 'Upload Script PDF'}</>
                  }
                </button>
              </div>
            </div>

            {/* Script items */}
            {isUploading ? (
              <div className="px-4 py-6 flex items-center justify-center gap-2 text-sm text-[#888]">
                <Loader size={16} className="animate-spin text-[#4f8ef7]" />
                Uploading &amp; parsing PDF…
              </div>
            ) : shootScripts.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Upload size={24} className="mx-auto mb-2 text-[#3a3a3a]" />
                <p className="text-sm text-[#555] mb-1">No scripts yet</p>
                <p className="text-xs text-[#3a3a3a]">Upload a PDF script and it will be automatically split into checkable sections</p>
              </div>
            ) : (
              <div className="divide-y divide-[#1e1e1e]">
                {shootScripts.map((script, idx) => (
                  <button
                    key={script.id}
                    onClick={() => toggleScript(script)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#252525] transition-colors group ${script.done ? 'opacity-60' : ''}`}
                  >
                    {/* Checkbox */}
                    <div className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      script.done ? 'bg-[#10b981] border-[#10b981]' : 'border-[#3a3a3a] group-hover:border-[#555]'
                    }`}>
                      {script.done && <Check size={9} className="text-white" />}
                    </div>

                    {/* Section number + content */}
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] text-[#3a3a3a] mr-2">#{idx + 1}</span>
                      <span className={`text-sm leading-relaxed ${script.done ? 'line-through text-[#555]' : 'text-[#c8c8c8]'}`}>
                        {script.content}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Progress footer */}
            {shootScripts.length > 0 && (
              <div className="px-4 py-2.5 bg-[#191919] border-t border-[#1e1e1e] flex items-center gap-3">
                <div className="flex-1 h-1 bg-[#2e2e2e] rounded-full overflow-hidden">
                  <div className="h-full bg-[#10b981] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[10px] text-[#555] flex-shrink-0">
                  {doneCount === shootScripts.length ? '✓ All done!' : `${shootScripts.length - doneCount} remaining`}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2e2e2e] flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-[#e8e8e8]">Shoot Schedule</h1>
          <p className="text-xs text-[#888] mt-0.5">{upcomingShoots.length} upcoming · upload a PDF script to any shoot</p>
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
          <Button size="sm" onClick={() => { setEditShoot(null); setForm({ client_id: '', shoot_date: '', shoot_time: '', location: '', notes: '' }); setShowAdd(true) }}>
            <Plus size={14} /> Add Shoot
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {view === 'list' ? (
          upcomingShoots.length === 0 ? (
            <div className="text-center py-20 text-[#888] text-sm">No upcoming shoots.</div>
          ) : (
            <div className="space-y-2">
              {upcomingShoots.map(shoot => renderShootCard(shoot))}
            </div>
          )
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
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} className="bg-[#191919] px-2 py-2 text-center text-[10px] font-medium text-[#888] uppercase tracking-wide">{d}</div>
              ))}
              {calCells.map((day, i) => (
                <div key={i} className="bg-[#202020] min-h-[80px] p-1.5">
                  {day && (
                    <>
                      <p className="text-xs text-[#888] mb-1">{day}</p>
                      {(shootsByDay[day] ?? []).map(s => {
                        const c = s.client_id ? clientMap[s.client_id] : null
                        const sc = scripts[s.id] ?? []
                        const done = sc.filter(x => x.done).length
                        return (
                          <button key={s.id} onClick={() => { setView('list'); toggleExpand(s.id) }}
                            className="w-full text-left px-1.5 py-0.5 rounded-chip text-[10px] font-medium truncate mb-0.5"
                            style={{ backgroundColor: c ? `${c.color}30` : '#2e2e2e', color: c ? c.color : '#888' }}>
                            {c ? c.name.split(' ')[0] : 'Shoot'}
                            {sc.length > 0 && <span className="ml-1 opacity-60">({done}/{sc.length})</span>}
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
