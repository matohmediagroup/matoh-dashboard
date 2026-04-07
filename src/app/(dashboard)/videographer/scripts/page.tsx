'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, ChevronDown, ChevronUp, Check, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { logActivity } from '@/lib/activity'
import type { Script, ScriptShot, Client } from '@/types/database'

type ScriptWithShots = Script & { shots: ScriptShot[] }

export default function ScriptsPage() {
  const supabase = createClient()
  const [scripts, setScripts] = useState<ScriptWithShots[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filterClient, setFilterClient] = useState('')
  const [showAddScript, setShowAddScript] = useState(false)
  const [showAddShot, setShowAddShot] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [scriptForm, setScriptForm] = useState({ title: '', client_id: '', body: '' })
  const [shotTitle, setShotTitle] = useState('')

  const fetchData = useCallback(async () => {
    const [{ data: scriptsData }, { data: shotsData }, { data: clientsData }] = await Promise.all([
      supabase.from('scripts').select('*').order('created_at', { ascending: false }),
      supabase.from('script_shots').select('*').order('created_at'),
      supabase.from('clients').select('*').order('name'),
    ])
    const combined = (scriptsData ?? []).map(s => ({
      ...s,
      shots: (shotsData ?? []).filter(sh => sh.script_id === s.id),
    }))
    setScripts(combined)
    setClients(clientsData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]))

  async function addScript() {
    if (!scriptForm.title.trim()) return
    setSaving(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('scripts') as any).insert({
      title: scriptForm.title,
      client_id: scriptForm.client_id || null,
      body: scriptForm.body || null,
    })
    setSaving(false)
    setShowAddScript(false)
    setScriptForm({ title: '', client_id: '', body: '' })
    fetchData()
  }

  async function addShot(scriptId: string) {
    if (!shotTitle.trim()) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('script_shots') as any).insert({ script_id: scriptId, shot_title: shotTitle })
    await logActivity('shot_added', `Shot "${shotTitle}" added to script`, 'script', scriptId)
    setShotTitle('')
    setShowAddShot(null)
    fetchData()
  }

  async function toggleShot(shot: ScriptShot) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('script_shots') as any).update({ filmed: !shot.filmed }).eq('id', shot.id)
    if (!shot.filmed) {
      await logActivity('shot_filmed', `Shot "${shot.shot_title}" marked as filmed`, 'script_shot', shot.id)
    }
    fetchData()
  }

  async function deleteShot(id: string) {
    await supabase.from('script_shots').delete().eq('id', id)
    fetchData()
  }

  if (loading) return <PageSpinner />

  const filtered = filterClient ? scripts.filter(s => s.client_id === filterClient) : scripts

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2e2e2e] flex-shrink-0">
        <h1 className="text-xl font-semibold text-[#e8e8e8]">Scripts</h1>
        <div className="flex items-center gap-2">
          <select
            value={filterClient}
            onChange={e => setFilterClient(e.target.value)}
            className="px-3 py-1.5 rounded-card bg-[#191919] border border-[#2e2e2e] text-[#888] text-xs focus:outline-none focus:border-[#4f8ef7]"
          >
            <option value="">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button size="sm" onClick={() => setShowAddScript(true)}>
            <Plus size={14} /> Add Script
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-20 text-[#888] text-sm">No scripts yet.</div>
        )}
        {filtered.map(script => {
          const client = script.client_id ? clientMap[script.client_id] : null
          const filmedCount = script.shots.filter(s => s.filmed).length
          const isExpanded = expanded === script.id
          const statusVariant = script.status === 'fully_filmed' ? 'fully_filmed' : script.status === 'partially_filmed' ? 'partially_filmed' : 'not_filmed_script'

          return (
            <div key={script.id} className="bg-[#202020] border border-[#2e2e2e] rounded-card overflow-hidden">
              <button
                onClick={() => setExpanded(isExpanded ? null : script.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-[#252525] transition-colors"
              >
                {client && <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: client.color }} />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-[#e8e8e8]">{script.title}</span>
                    {client && <Badge color={client.color} label={client.name.split(' ')[0]} />}
                    <Badge variant={statusVariant} />
                  </div>
                  {script.shots.length > 0 && (
                    <p className="text-xs text-[#888] mt-0.5">{filmedCount}/{script.shots.length} shots filmed</p>
                  )}
                </div>
                {script.shots.length > 0 && (
                  <div className="w-24 h-1.5 bg-[#2e2e2e] rounded-full overflow-hidden flex-shrink-0">
                    <div className="h-full bg-[#10b981] rounded-full transition-all" style={{ width: `${script.shots.length > 0 ? (filmedCount / script.shots.length) * 100 : 0}%` }} />
                  </div>
                )}
                {isExpanded ? <ChevronUp size={14} className="text-[#888] flex-shrink-0" /> : <ChevronDown size={14} className="text-[#888] flex-shrink-0" />}
              </button>

              {isExpanded && (
                <div className="border-t border-[#2e2e2e] p-4">
                  {script.body && (
                    <div className="mb-4 p-3 bg-[#191919] rounded-card">
                      <p className="text-xs text-[#888] uppercase tracking-wide mb-2">Script</p>
                      <p className="text-sm text-[#e8e8e8] whitespace-pre-wrap leading-relaxed">{script.body}</p>
                    </div>
                  )}

                  <p className="text-xs text-[#888] uppercase tracking-wide mb-2">Shot Checklist</p>
                  <div className="space-y-1 mb-3">
                    {script.shots.map(shot => (
                      <div key={shot.id} className="flex items-center gap-2 group">
                        <button
                          onClick={() => toggleShot(shot)}
                          className={`w-5 h-5 rounded-chip border flex-shrink-0 flex items-center justify-center transition-colors ${shot.filmed ? 'bg-[#10b981] border-[#10b981]' : 'border-[#2e2e2e] hover:border-[#4f8ef7]'}`}
                        >
                          {shot.filmed && <Check size={11} className="text-white" />}
                        </button>
                        <span className={`text-sm flex-1 ${shot.filmed ? 'line-through text-[#555]' : 'text-[#e8e8e8]'}`}>
                          {shot.shot_title}
                        </span>
                        <button onClick={() => deleteShot(shot.id)} className="opacity-0 group-hover:opacity-100 p-1 text-[#888] hover:text-[#ef4444] transition-all">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    {script.shots.length === 0 && <p className="text-xs text-[#555]">No shots added yet.</p>}
                  </div>

                  {showAddShot === script.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={shotTitle}
                        onChange={e => setShotTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addShot(script.id); if (e.key === 'Escape') { setShowAddShot(null); setShotTitle('') } }}
                        placeholder="Shot description…"
                        className="flex-1 px-2 py-1.5 rounded-card bg-[#191919] border border-[#4f8ef7] text-[#e8e8e8] text-sm focus:outline-none"
                      />
                      <Button size="sm" onClick={() => addShot(script.id)}>Add</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setShowAddShot(null); setShotTitle('') }}>Cancel</Button>
                    </div>
                  ) : (
                    <button onClick={() => setShowAddShot(script.id)} className="flex items-center gap-1.5 text-xs text-[#888] hover:text-[#4f8ef7] transition-colors">
                      <Plus size={12} /> Add shot
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Modal open={showAddScript} onClose={() => setShowAddScript(false)} title="Add Script" width="lg">
        <div className="space-y-3">
          <Input label="Title *" value={scriptForm.title} onChange={e => setScriptForm(p => ({ ...p, title: e.target.value }))} placeholder="Script title" />
          <Select label="Client" value={scriptForm.client_id} onChange={e => setScriptForm(p => ({ ...p, client_id: e.target.value }))}>
            <option value="">No client</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Textarea label="Script Body" value={scriptForm.body} onChange={e => setScriptForm(p => ({ ...p, body: e.target.value }))} rows={6} placeholder="Full script text…" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAddScript(false)}>Cancel</Button>
            <Button onClick={addScript} disabled={saving || !scriptForm.title.trim()}>
              {saving ? 'Saving…' : 'Add Script'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
