'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Play, RefreshCw, ChevronDown, ChevronUp, Plus, ExternalLink, Clock, CheckCircle, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import type { Client } from '@/types/database'

// Maps client IDs to dealer_key used in dealer-scripter config.json
const DEALER_KEY_MAP: Record<string, string> = {
  'Volkswagen Pacific':   'volkswagen_pacific',
  'Audi Pacific':        'audi_pacific',
  'Hyundai Santa Monica':'hyundai_santa_monica',
  'Toyota Santa Monica': 'toyota_santa_monica',
  'Kia Santa Monica':    'kia_santa_monica',
  'Subaru Pacific':      'subaru_pacific',
  'Phillips Auto':       'phillips_auto',
  'Legends Apparel':     'legends_apparel',
  'CDFZ':                'cdfz',
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
}

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
    return () => {
      Object.values(pollingRef.current).forEach(clearInterval)
    }
  }, [fetchData])

  function pollJob(recordId: string, jobId: string) {
    if (pollingRef.current[recordId]) return
    pollingRef.current[recordId] = setInterval(async () => {
      const res = await fetch(`/api/scripter/status?record_id=${recordId}&job_id=${jobId}`)
      const data = await res.json() as { status?: string }
      if (data.status === 'done' || data.status === 'error') {
        clearInterval(pollingRef.current[recordId])
        delete pollingRef.current[recordId]
        fetchData()
      }
    }, 5000)
  }

  // Auto-poll running jobs
  useEffect(() => {
    runs.filter(r => r.status === 'running' && r.job_id).forEach(r => {
      pollJob(r.id, r.job_id!)
    })
  }, [runs])

  async function triggerRun(client: Client) {
    const dealerKey = DEALER_KEY_MAP[client.name]
    if (!dealerKey) {
      alert(`No dealer key configured for ${client.name}`)
      return
    }
    setTriggering(client.id)
    try {
      const res = await fetch('/api/scripter/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: client.id, dealer_key: dealerKey }),
      })
      const data = await res.json() as { record_id?: string; job_id?: string }
      if (data.record_id && data.job_id) {
        pollJob(data.record_id, data.job_id)
      }
      await fetchData()
    } finally {
      setTriggering('')
    }
  }

  if (loading) return <PageSpinner />

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]))
  const displayedRuns = selectedClient === 'all'
    ? runs
    : runs.filter(r => r.client_id === selectedClient)

  const statusIcon = (status: string) => {
    if (status === 'running') return <RefreshCw size={13} className="animate-spin text-[#4f8ef7]" />
    if (status === 'done') return <CheckCircle size={13} className="text-[#10b981]" />
    if (status === 'error') return <XCircle size={13} className="text-[#ef4444]" />
    return <Clock size={13} className="text-[#888]" />
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2e2e2e] flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-[#e8e8e8]">Script Generator</h1>
          <p className="text-xs text-[#888] mt-0.5">Powered by dealer-scripter.onrender.com</p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* Client trigger cards */}
      <div className="px-6 py-4 border-b border-[#2e2e2e] flex-shrink-0">
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
            No scripts generated yet. Pick a client above and hit the play button.
          </div>
        )}
        {displayedRuns.map(run => {
          const client = clientMap[run.client_id]
          const isExpanded = expanded === run.id
          const scripts = (run.scripts ?? []) as ScriptItem[]

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
                  </div>
                  {run.status === 'running' && (
                    <p className="text-xs text-[#4f8ef7] mt-0.5">Generating scripts… this takes 1–2 minutes</p>
                  )}
                  {run.status === 'done' && (
                    <p className="text-xs text-[#888] mt-0.5">{scripts.length} scripts generated</p>
                  )}
                </div>
                {isExpanded ? <ChevronUp size={14} className="text-[#888]" /> : <ChevronDown size={14} className="text-[#888]" />}
              </button>

              {isExpanded && run.status === 'done' && scripts.length > 0 && (
                <div className="border-t border-[#2e2e2e] p-4 space-y-3">
                  {scripts.map((script, i) => {
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
                            {script.hook && (
                              <div>
                                <p className="text-[10px] font-semibold text-[#4f8ef7] uppercase tracking-wide mb-1">Hook</p>
                                <p className="text-[#e8e8e8] bg-[#191919] p-3 rounded-card leading-relaxed">{script.hook}</p>
                              </div>
                            )}
                            {script.body && (
                              <div>
                                <p className="text-[10px] font-semibold text-[#888] uppercase tracking-wide mb-1">Body</p>
                                <p className="text-[#e8e8e8] whitespace-pre-wrap leading-relaxed text-xs">{script.body}</p>
                              </div>
                            )}
                            {script.cta && (
                              <div>
                                <p className="text-[10px] font-semibold text-[#888] uppercase tracking-wide mb-1">CTA</p>
                                <p className="text-[#e8e8e8] text-xs">{script.cta}</p>
                              </div>
                            )}
                            {script.director_notes && (
                              <div>
                                <p className="text-[10px] font-semibold text-[#f59e0b] uppercase tracking-wide mb-1">Director Notes</p>
                                <p className="text-[#888] text-xs">{script.director_notes}</p>
                              </div>
                            )}
                            {script.caption_hook && (
                              <div>
                                <p className="text-[10px] font-semibold text-[#888] uppercase tracking-wide mb-1">Caption</p>
                                <p className="text-[#888] text-xs italic">{script.caption_hook}</p>
                              </div>
                            )}
                            {script.filming_requirement && (
                              <div>
                                <p className="text-[10px] font-semibold text-[#888] uppercase tracking-wide mb-1">Filming Requirements</p>
                                <p className="text-[#888] text-xs">{script.filming_requirement}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
