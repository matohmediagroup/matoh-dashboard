'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Play, RefreshCw, ChevronDown, ChevronUp, Clock, CheckCircle, XCircle, Wifi, WifiOff, Terminal } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import type { Client } from '@/types/database'

const DEALER_KEY_MAP: Record<string, string> = {
  'Volkswagen Pacific':    'volkswagen_pacific',
  'Audi Pacific':          'audi_pacific',
  'Hyundai Santa Monica':  'hyundai_santa_monica',
  'Toyota Santa Monica':   'toyota_santa_monica',
  'Kia Santa Monica':      'kia_santa_monica',
  'Subaru Pacific':        'subaru_pacific',
  'Phillips Auto':         'phillips_auto',
  'Legends Apparel':       'legends_apparel',
  'CDFZ':                  'cdfz',
}

interface GeneratedScript {
  id: string
  client_id: string
  dealer_key: string
  run_date: string
  scripts: ScriptItem[]
  status: 'pending' | 'running' | 'done' | 'error'
  job_id: string | null
  created_at: string
}

interface ScriptItem {
  script_number: number
  script_type: string
  title: string
  platform: string
  estimated_length: string
  hook_type: string
  hook: string
  body: string
  cta: string
  director_notes: string
  caption_hook: string
  cars_featured: string[]
  filming_requirement: string
  inspired_by: string
  // debug fields
  _debug?: string
  _status?: number
}

interface PingStep { step: string; ok: boolean; detail: string }
interface LogLine { ts: string; msg: string; type: 'info' | 'ok' | 'error' | 'debug' }

export default function ScriptsGeneratorPage() {
  const supabase = createClient()
  const [clients, setClients] = useState<Client[]>([])
  const [runs, setRuns] = useState<GeneratedScript[]>([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState<string>('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [expandedScript, setExpandedScript] = useState<string | null>(null)
  const [selectedClient, setSelectedClient] = useState<string>('all')
  const pollingRef = useRef<Record<string, NodeJS.Timeout>>({})

  // Connection test
  const [pingLoading, setPingLoading] = useState(false)
  const [pingSteps, setPingSteps] = useState<PingStep[]>([])
  const [pingDone, setPingDone] = useState(false)
  const [showDebug, setShowDebug] = useState(false)

  // Live logs for active run
  const [activeLogs, setActiveLogs] = useState<Record<string, LogLine[]>>({})

  const addLog = (recordId: string, msg: string, type: LogLine['type'] = 'info') => {
    const line: LogLine = { ts: new Date().toLocaleTimeString(), msg, type }
    setActiveLogs(prev => ({ ...prev, [recordId]: [...(prev[recordId] ?? []), line] }))
  }

  const fetchData = useCallback(async () => {
    const [{ data: clientsData }, { data: runsData }] = await Promise.all([
      supabase.from('clients').select('*').eq('status', 'active').order('name'),
      supabase.from('generated_scripts').select('*').order('created_at', { ascending: false }),
    ])
    setClients(clientsData ?? [])
    setRuns((runsData ?? []) as GeneratedScript[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    return () => { Object.values(pollingRef.current).forEach(clearInterval) }
  }, [fetchData])

  async function testConnection() {
    setPingLoading(true)
    setPingSteps([])
    setPingDone(false)
    setShowDebug(true)
    try {
      const res = await fetch('/api/scripter/ping')
      const data = await res.json() as { steps: PingStep[] }
      setPingSteps(data.steps ?? [])
    } finally {
      setPingLoading(false)
      setPingDone(true)
    }
  }

  function pollJob(recordId: string, jobId: string) {
    if (pollingRef.current[recordId]) return
    addLog(recordId, `Polling job ${jobId}…`, 'info')
    pollingRef.current[recordId] = setInterval(async () => {
      try {
        const res = await fetch(`/api/scripter/status?record_id=${recordId}&job_id=${jobId}`)
        const data = await res.json() as { status?: string; logs?: string[]; progress?: string; _raw?: string; _http_status?: number; error?: string }

        addLog(recordId, `Poll → HTTP ${data._http_status ?? '?'} · status=${data.status ?? 'unknown'} ${data.progress ? `· ${data.progress}` : ''}`, data.status === 'error' ? 'error' : 'debug')

        if (data.logs?.length) {
          data.logs.forEach(l => addLog(recordId, l, 'debug'))
        }
        if (data._raw && data._raw !== '{}') {
          addLog(recordId, `Raw: ${data._raw.slice(0, 300)}`, 'debug')
        }

        if (data.status === 'done') {
          addLog(recordId, '✓ Scripts generated successfully!', 'ok')
          clearInterval(pollingRef.current[recordId])
          delete pollingRef.current[recordId]
          fetchData()
        } else if (data.status === 'error') {
          addLog(recordId, `✗ Error: ${data.error ?? data._raw ?? 'unknown error'}`, 'error')
          clearInterval(pollingRef.current[recordId])
          delete pollingRef.current[recordId]
          fetchData()
        }
      } catch (e) {
        addLog(recordId, `Poll error: ${String(e)}`, 'error')
      }
    }, 5000)
  }

  useEffect(() => {
    runs.filter(r => r.status === 'running' && r.job_id).forEach(r => {
      pollJob(r.id, r.job_id!)
    })
  }, [runs])

  async function triggerRun(client: Client) {
    const dealerKey = DEALER_KEY_MAP[client.name]
    if (!dealerKey) { alert(`No dealer key configured for ${client.name}`); return }
    setTriggering(client.id)
    setShowDebug(true)
    try {
      const res = await fetch('/api/scripter/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: client.id, dealer_key: dealerKey }),
      })
      const data = await res.json() as { record_id?: string; job_id?: string; error?: string; debug?: { status: number; raw: string; had_cookie: boolean } }

      if (data.record_id) {
        addLog(data.record_id, `▶ Triggered run for ${client.name} (dealer_key=${dealerKey})`, 'info')
        if (data.debug) {
          addLog(data.record_id, `Auth: had_cookie=${data.debug.had_cookie} · HTTP ${data.debug.status}`, 'debug')
          addLog(data.record_id, `Response: ${data.debug.raw.slice(0, 300)}`, 'debug')
        }
        if (data.job_id) {
          addLog(data.record_id, `✓ Job ID: ${data.job_id} — polling every 5s`, 'ok')
          pollJob(data.record_id, data.job_id)
        } else {
          addLog(data.record_id, `✗ No job_id returned — check debug above`, 'error')
        }
        setExpanded(data.record_id)
      } else if (data.error) {
        console.error('Run error:', data.error)
      }
      await fetchData()
    } finally {
      setTriggering('')
    }
  }

  if (loading) return <PageSpinner />

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]))
  const displayedRuns = selectedClient === 'all' ? runs : runs.filter(r => r.client_id === selectedClient)

  const statusIcon = (status: string) => {
    if (status === 'running') return <RefreshCw size={13} className="animate-spin text-[#4f8ef7]" />
    if (status === 'done') return <CheckCircle size={13} className="text-[#10b981]" />
    if (status === 'error') return <XCircle size={13} className="text-[#ef4444]" />
    return <Clock size={13} className="text-[#888]" />
  }

  const allConnOk = pingSteps.length > 0 && pingSteps.every(s => s.ok)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2e2e2e] flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-[#e8e8e8]">Script Generator</h1>
          <p className="text-xs text-[#888] mt-0.5">Powered by dealer-scripter.onrender.com</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={testConnection} disabled={pingLoading}>
            {pingLoading ? <RefreshCw size={13} className="animate-spin" /> : pingDone ? allConnOk ? <Wifi size={13} className="text-[#10b981]" /> : <WifiOff size={13} className="text-[#ef4444]" /> : <Wifi size={13} />}
            {pingLoading ? 'Testing…' : 'Test Connection'}
          </Button>
          <Button variant="ghost" onClick={() => setShowDebug(v => !v)}>
            <Terminal size={13} /> {showDebug ? 'Hide' : 'Show'} Logs
          </Button>
          <select
            value={selectedClient}
            onChange={e => setSelectedClient(e.target.value)}
            className="px-3 py-1.5 rounded-card bg-[#191919] border border-[#2e2e2e] text-[#888] text-xs focus:outline-none"
          >
            <option value="all">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Connection test results */}
      {showDebug && (pingSteps.length > 0 || Object.keys(activeLogs).length > 0) && (
        <div className="mx-6 mt-4 bg-[#0d0d0d] border border-[#2e2e2e] rounded-card overflow-hidden flex-shrink-0">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#2e2e2e]">
            <Terminal size={12} className="text-[#888]" />
            <span className="text-xs font-mono text-[#888]">dealer-scripter debug console</span>
          </div>
          <div className="p-4 font-mono text-[11px] space-y-1 max-h-64 overflow-y-auto">
            {pingSteps.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={s.ok ? 'text-[#10b981]' : 'text-[#ef4444]'}>{s.ok ? '✓' : '✗'}</span>
                <span className="text-[#4f8ef7] min-w-[140px]">{s.step}</span>
                <span className="text-[#888] break-all">{s.detail}</span>
              </div>
            ))}
            {Object.entries(activeLogs).map(([recordId, lines]) =>
              lines.map((l, i) => (
                <div key={`${recordId}-${i}`} className="flex items-start gap-2">
                  <span className="text-[#555]">{l.ts}</span>
                  <span className={
                    l.type === 'ok' ? 'text-[#10b981] break-all' :
                    l.type === 'error' ? 'text-[#ef4444] break-all' :
                    l.type === 'debug' ? 'text-[#555] break-all' :
                    'text-[#e8e8e8] break-all'
                  }>{l.msg}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Client trigger cards */}
      <div className="px-6 py-4 border-b border-[#2e2e2e] flex-shrink-0 mt-2">
        <p className="text-xs text-[#888] uppercase tracking-wide mb-3">Generate Scripts</p>
        <div className="flex gap-2 flex-wrap">
          {clients.map(client => {
            const dealerKey = DEALER_KEY_MAP[client.name]
            const runningRun = runs.find(r => r.client_id === client.id && r.status === 'running')
            const isRunning = !!runningRun || triggering === client.id
            return (
              <button
                key={client.id}
                onClick={() => triggerRun(client)}
                disabled={isRunning || !dealerKey}
                className="flex items-center gap-2 px-3 py-2 rounded-card border border-[#2e2e2e] bg-[#202020] hover:border-[#3a3a3a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: client.color }} />
                <span className="text-xs font-medium text-[#e8e8e8]">{client.name.split(' ')[0]}</span>
                {isRunning
                  ? <RefreshCw size={11} className="animate-spin text-[#4f8ef7]" />
                  : dealerKey
                    ? <Play size={11} className="text-[#4f8ef7]" />
                    : <span className="text-[10px] text-[#555]">not configured</span>
                }
              </button>
            )
          })}
        </div>
      </div>

      {/* Run history */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        <p className="text-xs text-[#888] uppercase tracking-wide mb-1">Generated Script Runs</p>
        {displayedRuns.length === 0 && (
          <div className="text-center py-16 text-[#555] text-sm">
            No scripts generated yet. Hit "Test Connection" first, then pick a client.
          </div>
        )}
        {displayedRuns.map(run => {
          const client = clientMap[run.client_id]
          const isExpanded = expanded === run.id
          const scripts = (run.scripts ?? []) as ScriptItem[]
          const debugScript = scripts.find(s => s._debug)
          const runLogs = activeLogs[run.id] ?? []

          return (
            <div key={run.id} className="bg-[#202020] border border-[#2e2e2e] rounded-card overflow-hidden">
              <button
                onClick={() => setExpanded(isExpanded ? null : run.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-[#252525] transition-colors"
              >
                {client && <div className="w-1 self-stretch rounded-full" style={{ backgroundColor: client.color }} />}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {statusIcon(run.status)}
                    <span className="text-sm font-medium text-[#e8e8e8]">{client?.name ?? run.dealer_key}</span>
                    <span className="text-xs text-[#555]">
                      {new Date(run.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {run.job_id && <span className="text-[10px] text-[#555] font-mono">job:{run.job_id.slice(0, 8)}</span>}
                  </div>
                  {run.status === 'running' && (
                    <p className="text-xs text-[#4f8ef7] mt-0.5">Generating… check logs panel above</p>
                  )}
                  {run.status === 'done' && (
                    <p className="text-xs text-[#888] mt-0.5">{scripts.filter(s => !s._debug).length} scripts generated</p>
                  )}
                  {run.status === 'error' && debugScript && (
                    <p className="text-xs text-[#ef4444] mt-0.5 font-mono truncate">{debugScript._debug?.slice(0, 80)}</p>
                  )}
                </div>
                {isExpanded ? <ChevronUp size={14} className="text-[#888]" /> : <ChevronDown size={14} className="text-[#888]" />}
              </button>

              {isExpanded && (
                <div className="border-t border-[#2e2e2e]">
                  {/* Debug info for errored/running runs */}
                  {(run.status === 'error' || run.status === 'running') && (debugScript || runLogs.length > 0) && (
                    <div className="p-4 bg-[#0d0d0d]">
                      <p className="text-[10px] font-semibold text-[#ef4444] uppercase tracking-wide mb-2">Debug Info</p>
                      {debugScript && (
                        <pre className="text-[10px] font-mono text-[#888] whitespace-pre-wrap break-all">
                          HTTP status: {debugScript._status ?? 'unknown'}{'\n'}
                          Response: {debugScript._debug}
                        </pre>
                      )}
                      {runLogs.length > 0 && (
                        <div className="mt-2 space-y-0.5">
                          {runLogs.map((l, i) => (
                            <div key={i} className={`text-[10px] font-mono ${l.type === 'error' ? 'text-[#ef4444]' : l.type === 'ok' ? 'text-[#10b981]' : 'text-[#555]'}`}>
                              [{l.ts}] {l.msg}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Scripts */}
                  {run.status === 'done' && scripts.filter(s => !s._debug).length > 0 && (
                    <div className="p-4 space-y-3">
                      {scripts.filter(s => !s._debug).map((script, i) => {
                        const key = `${run.id}-${i}`
                        const isScriptExpanded = expandedScript === key
                        return (
                          <div key={i} className="border border-[#2e2e2e] rounded-card overflow-hidden">
                            <button
                              onClick={() => setExpandedScript(isScriptExpanded ? null : key)}
                              className="w-full flex items-start gap-3 p-3 text-left hover:bg-[#252525] transition-colors"
                            >
                              <span className="text-xs font-bold text-[#555] mt-0.5 w-5 flex-shrink-0">#{script.script_number}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-[#e8e8e8] truncate">{script.title}</p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <Badge variant="default" label={script.platform} />
                                  <Badge variant="default" label={script.script_type?.replace(/_/g, ' ')} />
                                  {script.estimated_length && (
                                    <span className="text-[10px] text-[#888] flex items-center gap-0.5">
                                      <Clock size={9} /> {script.estimated_length}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {isScriptExpanded ? <ChevronUp size={13} className="text-[#888] flex-shrink-0 mt-0.5" /> : <ChevronDown size={13} className="text-[#888] flex-shrink-0 mt-0.5" />}
                            </button>
                            {isScriptExpanded && (
                              <div className="border-t border-[#2e2e2e] p-4 space-y-4 text-sm">
                                {script.hook && <div><p className="text-[10px] font-semibold text-[#4f8ef7] uppercase tracking-wide mb-1">Hook</p><p className="text-[#e8e8e8] bg-[#191919] p-3 rounded-card leading-relaxed">{script.hook}</p></div>}
                                {script.body && <div><p className="text-[10px] font-semibold text-[#888] uppercase tracking-wide mb-1">Body</p><p className="text-[#e8e8e8] whitespace-pre-wrap leading-relaxed text-xs">{script.body}</p></div>}
                                {script.cta && <div><p className="text-[10px] font-semibold text-[#888] uppercase tracking-wide mb-1">CTA</p><p className="text-[#e8e8e8] text-xs">{script.cta}</p></div>}
                                {script.director_notes && <div><p className="text-[10px] font-semibold text-[#f59e0b] uppercase tracking-wide mb-1">Director Notes</p><p className="text-[#888] text-xs">{script.director_notes}</p></div>}
                                {script.caption_hook && <div><p className="text-[10px] font-semibold text-[#888] uppercase tracking-wide mb-1">Caption</p><p className="text-[#888] text-xs italic">{script.caption_hook}</p></div>}
                                {script.filming_requirement && <div><p className="text-[10px] font-semibold text-[#888] uppercase tracking-wide mb-1">Filming Requirements</p><p className="text-[#888] text-xs">{script.filming_requirement}</p></div>}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
