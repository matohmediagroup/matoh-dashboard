'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Upload, Plus, AlertTriangle, ExternalLink,
  Pencil, Check, X, Film, Calendar, DollarSign,
  Users, TrendingUp, Eye, Heart, FileText, Phone, Mail, User
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageSpinner } from '@/components/ui/Spinner'
import { logActivity } from '@/lib/activity'
import type { Client, Invoice, ContentItem, Shoot } from '@/types/database'

type Tab = 'overview' | 'videos' | 'shoots' | 'invoices' | 'social'

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  unassigned:  { bg: '#2a2a2a', color: '#888' },
  in_progress: { bg: '#1e3a5f', color: '#4f8ef7' },
  revisions:   { bg: '#3d2e00', color: '#f59e0b' },
  done:        { bg: '#0d3d2a', color: '#10b981' },
  filmed:      { bg: '#2d1657', color: '#a855f7' },
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

export default function ClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const id = params.id as string

  const [client, setClient] = useState<Client | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [videos, setVideos] = useState<ContentItem[]>([])
  const [shoots, setShoots] = useState<Shoot[]>([])
  const [socialStats, setSocialStats] = useState<any[]>([])
  const [editors, setEditors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showAddInvoice, setShowAddInvoice] = useState(false)
  const [showAddVideo, setShowAddVideo] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState({ amount: '', status: 'unpaid', due_date: '' })
  const [videoForm, setVideoForm] = useState({ title: '', edit_status: 'unassigned', assigned_editor_id: '' })
  const [savingInvoice, setSavingInvoice] = useState(false)
  const [savingVideo, setSavingVideo] = useState(false)
  const [uploadingContract, setUploadingContract] = useState(false)

  const fetchData = useCallback(async () => {
    const [
      { data: clientData },
      { data: invoiceData },
      { data: videoData },
      { data: shootData },
      { data: statsData },
      { data: editorsData },
    ] = await Promise.all([
      supabase.from('clients').select('*').eq('id', id).single(),
      supabase.from('invoices').select('*').eq('client_id', id).order('created_at', { ascending: false }),
      supabase.from('content_items').select('*').eq('client_id', id).order('created_at', { ascending: false }),
      supabase.from('shoots').select('*').eq('client_id', id).order('shoot_date', { ascending: false }),
      (supabase.from('social_stats') as any).select('*').eq('client_id', id),
      supabase.from('profiles').select('*').in('role', ['editor', 'manager', 'owner']).order('full_name'),
    ])
    setClient(clientData)
    setInvoices(invoiceData ?? [])
    setVideos(videoData ?? [])
    setShoots(shootData ?? [])
    setSocialStats(statsData ?? [])
    setEditors(editorsData ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  async function saveField(field: string, value: string | number | null) {
    if (!client) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('clients') as any).update({ [field]: value }).eq('id', id)
    setClient(prev => prev ? { ...prev, [field]: value } : null)
    setEditingField(null)
  }

  async function addInvoice() {
    if (!invoiceForm.amount) return
    setSavingInvoice(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('invoices') as any).insert({
      client_id: id,
      amount: parseFloat(invoiceForm.amount),
      status: invoiceForm.status as 'paid' | 'unpaid' | 'overdue',
      due_date: invoiceForm.due_date || null,
    })
    await logActivity('invoice_created', `Invoice created for ${client?.name}`, 'invoice', id)
    setSavingInvoice(false)
    setShowAddInvoice(false)
    setInvoiceForm({ amount: '', status: 'unpaid', due_date: '' })
    fetchData()
  }

  async function addVideo() {
    if (!videoForm.title.trim()) return
    setSavingVideo(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('content_items') as any).insert({
      client_id: id,
      title: videoForm.title.trim(),
      edit_status: videoForm.edit_status,
      assigned_editor_id: videoForm.assigned_editor_id || null,
      filming_status: 'not_filmed',
      approval_status: 'pending',
    })
    setSavingVideo(false)
    setShowAddVideo(false)
    setVideoForm({ title: '', edit_status: 'unassigned', assigned_editor_id: '' })
    fetchData()
  }

  async function markInvoicePaid(invoice: Invoice) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('invoices') as any).update({ status: 'paid' }).eq('id', invoice.id)
    await logActivity('invoice_paid', `Invoice marked paid for ${client?.name}`, 'invoice', invoice.id)
    fetchData()
  }

  async function uploadContractPDF(file: File) {
    setUploadingContract(true)
    const path = `contracts/${id}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('contracts').upload(path, file, { upsert: true })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('contracts').getPublicUrl(path)
      await saveField('contract_url', publicUrl)
    }
    setUploadingContract(false)
  }

  if (loading) return <PageSpinner />
  if (!client) return <div className="p-6 text-[#888]">Client not found.</div>

  const editorMap = Object.fromEntries(editors.map(e => [e.id, e]))
  const contractEnd = (client as any).contract_end
  const contractStart = (client as any).contract_start
  const contractUrl = client.contract_url

  const renewalDays = contractEnd ? daysUntil(contractEnd) : null
  const contractExpiring = renewalDays !== null && renewalDays <= 60 && renewalDays >= 0
  const contractExpired = renewalDays !== null && renewalDays < 0

  // Stats
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0)
  const outstanding = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + i.amount, 0)
  const videosInProgress = videos.filter(v => v.edit_status === 'in_progress').length
  const videosPosted = videos.filter(v => v.filming_status === 'filmed').length
  const upcomingShoots = shoots.filter(s => new Date(s.shoot_date) >= new Date())
  const totalFollowers = socialStats.reduce((s, st) => s + (st.followers || 0), 0)

  const TABS: { key: Tab; label: string; icon: any; count?: number }[] = [
    { key: 'overview', label: 'Overview', icon: TrendingUp },
    { key: 'videos', label: 'Videos', icon: Film, count: videos.length },
    { key: 'shoots', label: 'Shoots', icon: Calendar, count: shoots.length },
    { key: 'invoices', label: 'Invoices', icon: DollarSign, count: invoices.length },
    { key: 'social', label: 'Social', icon: Users, count: socialStats.length },
  ]

  function EditableField({ label, field, value, rawValue, type = 'text' }: {
    label: string; field: string; value: string | null | undefined
    rawValue?: string; type?: string
  }) {
    return (
      <div className="flex items-center justify-between py-2 border-b border-[#2e2e2e] last:border-0">
        <span className="text-xs text-[#888] w-36 flex-shrink-0">{label}</span>
        {editingField === field ? (
          <div className="flex items-center gap-2 flex-1">
            <input autoFocus type={type}
              className="flex-1 px-2 py-1 rounded-chip bg-[#191919] border border-[#4f8ef7] text-[#e8e8e8] text-sm focus:outline-none"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveField(field, editValue || null)
                if (e.key === 'Escape') setEditingField(null)
              }}
            />
            <button onClick={() => saveField(field, editValue || null)} className="text-[#10b981]"><Check size={14} /></button>
            <button onClick={() => setEditingField(null)} className="text-[#888]"><X size={14} /></button>
          </div>
        ) : (
          <button onClick={() => { setEditingField(field); setEditValue(rawValue ?? value ?? '') }}
            className="flex items-center gap-2 text-sm text-[#e8e8e8] hover:text-[#4f8ef7] group transition-colors">
            <span>{value ? (type === 'date' ? formatDate(value) : value) : <span className="text-[#555]">—</span>}</span>
            <Pencil size={11} className="opacity-0 group-hover:opacity-100 transition-opacity text-[#555]" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-[#2e2e2e] flex-shrink-0">
        <button onClick={() => router.back()}
          className="p-1.5 rounded-card text-[#888] hover:text-[#e8e8e8] hover:bg-[#252525] transition-colors flex-shrink-0">
          <ArrowLeft size={16} />
        </button>
        <div className="w-10 h-10 rounded-card flex items-center justify-center font-bold text-base flex-shrink-0"
          style={{ backgroundColor: `${client.color}22`, color: client.color }}>
          {client.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-[#e8e8e8] truncate">{client.name}</h1>
            <Badge variant={client.status as 'active' | 'inactive'} />
            {contractExpired && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#3d1a1a] text-[#ef4444] font-medium">Contract Expired</span>}
            {contractExpiring && !contractExpired && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#3d2e00] text-[#f59e0b] font-medium">Expiring in {renewalDays}d</span>}
          </div>
          <p className="text-xs text-[#555]">{client.contact_name}{client.contact_email ? ` · ${client.contact_email}` : ''}</p>
        </div>
        {/* KPI strip */}
        <div className="hidden lg:flex items-center gap-6">
          {[
            { label: 'Revenue', value: formatCurrency(totalPaid), color: '#10b981' },
            { label: 'Outstanding', value: formatCurrency(outstanding), color: '#f59e0b' },
            { label: 'Videos', value: String(videos.length), color: '#4f8ef7' },
            { label: 'Followers', value: formatNum(totalFollowers), color: '#a855f7' },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <p className="text-[10px] text-[#555]">{label}</p>
              <p className="text-sm font-semibold" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 py-2 border-b border-[#2e2e2e] flex-shrink-0 bg-[#191919]">
        {TABS.map(({ key, label, icon: Icon, count }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-chip text-xs font-medium transition-colors ${tab === key ? 'bg-[#252525] text-[#e8e8e8]' : 'text-[#555] hover:text-[#888]'}`}>
            <Icon size={12} />
            {label}
            {count !== undefined && count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === key ? 'bg-[#3a3a3a] text-[#888]' : 'bg-[#252525] text-[#555]'}`}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-5xl">
            {/* Client info */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-[#202020] border border-[#2e2e2e] rounded-card p-5">
                <h3 className="text-sm font-semibold text-[#e8e8e8] mb-4">Client Info</h3>
                <div className="space-y-0">
                  <EditableField label="Contact Name" field="contact_name" value={client.contact_name} />
                  <EditableField label="Email" field="contact_email" value={client.contact_email} />
                  <EditableField label="Phone" field="contact_phone" value={client.contact_phone} />
                  <EditableField label="Monthly Retainer" field="monthly_retainer"
                    value={client.monthly_retainer ? formatCurrency(client.monthly_retainer) : null}
                    rawValue={String(client.monthly_retainer ?? '')} />
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-[#888] w-36 flex-shrink-0">Status</span>
                    <select value={client.status} onChange={e => saveField('status', e.target.value)}
                      className="text-sm bg-transparent text-[#e8e8e8] focus:outline-none cursor-pointer">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="pt-2">
                    <p className="text-xs text-[#888] mb-1">Notes</p>
                    <Textarea value={client.notes ?? ''}
                      onChange={e => setClient(prev => prev ? { ...prev, notes: e.target.value } : null)}
                      onBlur={e => saveField('notes', e.target.value)}
                      rows={3} placeholder="Add notes…" />
                  </div>
                </div>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Videos', value: videos.length, sub: `${videosInProgress} in progress`, color: '#4f8ef7' },
                  { label: 'Posted', value: videosPosted, sub: 'all time', color: '#a855f7' },
                  { label: 'Upcoming Shoots', value: upcomingShoots.length, sub: 'scheduled', color: '#10b981' },
                  { label: 'Total Revenue', value: formatCurrency(totalPaid), sub: `${formatCurrency(outstanding)} outstanding`, color: '#f59e0b' },
                ].map(({ label, value, sub, color }) => (
                  <div key={label} className="bg-[#202020] border border-[#2e2e2e] rounded-card p-3">
                    <p className="text-[10px] text-[#555] mb-1">{label}</p>
                    <p className="text-lg font-semibold" style={{ color }}>{value}</p>
                    <p className="text-[10px] text-[#555]">{sub}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Contract */}
            <div className="bg-[#202020] border border-[contractExpired ? '#ef4444' : contractExpiring ? '#f59e0b' : '#2e2e2e'] rounded-card p-5"
              style={{ borderColor: contractExpired ? '#ef444433' : contractExpiring ? '#f59e0b33' : '#2e2e2e' }}>
              <h3 className="text-sm font-semibold text-[#e8e8e8] mb-4">Contract</h3>

              {(contractExpired || contractExpiring) && (
                <div className={`flex items-center gap-2 rounded-card px-3 py-2 mb-4 ${contractExpired ? 'bg-[#ef4444]/10 border border-[#ef4444]/20' : 'bg-[#f59e0b]/10 border border-[#f59e0b]/20'}`}>
                  <AlertTriangle size={13} className={contractExpired ? 'text-[#ef4444]' : 'text-[#f59e0b]'} />
                  <p className={`text-xs ${contractExpired ? 'text-[#ef4444]' : 'text-[#f59e0b]'}`}>
                    {contractExpired ? `Expired ${Math.abs(renewalDays!)} days ago` : `Expiring in ${renewalDays} days`}
                  </p>
                </div>
              )}

              <div className="space-y-0">
                <EditableField label="Start Date" field="contract_start" value={contractStart} type="date" />
                <EditableField label="End Date" field="contract_end" value={contractEnd} type="date" />
                <EditableField label="Auto-Renewal" field="contract_auto_renewal" value={client.contract_auto_renewal} type="date" />
              </div>

              {/* Contract PDF */}
              <div className="mt-4 pt-4 border-t border-[#2e2e2e]">
                <p className="text-xs text-[#888] mb-2">Contract PDF</p>
                <div className="flex items-center gap-2">
                  {contractUrl ? (
                    <a href={contractUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-[#4f8ef7] hover:underline">
                      <FileText size={12} /> View Contract <ExternalLink size={10} />
                    </a>
                  ) : (
                    <span className="text-xs text-[#555]">No contract uploaded</span>
                  )}
                  <label className={`flex items-center gap-1 text-xs cursor-pointer transition-colors ml-auto ${uploadingContract ? 'text-[#4f8ef7]' : 'text-[#555] hover:text-[#e8e8e8]'}`}>
                    <Upload size={11} />
                    {uploadingContract ? 'Uploading…' : contractUrl ? 'Replace' : 'Upload PDF'}
                    <input type="file" accept=".pdf" className="hidden"
                      onChange={e => e.target.files?.[0] && uploadContractPDF(e.target.files[0])} />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── VIDEOS ── */}
        {tab === 'videos' && (
          <div className="max-w-5xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-[#e8e8e8]">{videos.length} Videos</h3>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-[#888]">{videos.filter(v => v.filming_status === 'filmed').length} posted</span>
                  <span className="text-[#4f8ef7]">{videos.filter(v => v.edit_status === 'in_progress').length} in progress</span>
                  <span className="text-[#f59e0b]">{videos.filter(v => v.edit_status === 'revisions').length} revisions</span>
                </div>
              </div>
              <Button size="sm" onClick={() => setShowAddVideo(true)}><Plus size={12} /> Add Video</Button>
            </div>

            {videos.length === 0 ? (
              <div className="text-center py-16 text-[#555]">
                <Film size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No videos yet</p>
              </div>
            ) : (
              <div className="bg-[#202020] border border-[#2e2e2e] rounded-card overflow-hidden">
                <div className="grid bg-[#191919] border-b border-[#2e2e2e]" style={{ gridTemplateColumns: '1fr 130px 150px 110px' }}>
                  {['Title', 'Status', 'Editor', 'Post Date'].map(h => (
                    <div key={h} className="px-4 py-2 text-[10px] font-semibold text-[#555] uppercase tracking-wide">{h}</div>
                  ))}
                </div>
                {videos.map((video, idx) => {
                  const editor = video.assigned_editor_id ? editorMap[video.assigned_editor_id] : null
                  const statusKey = video.filming_status === 'filmed' ? 'filmed' : video.edit_status
                  const statusStyle = STATUS_COLORS[statusKey] || STATUS_COLORS.unassigned
                  const statusLabel = video.filming_status === 'filmed' ? 'Posted' :
                    video.edit_status === 'in_progress' ? 'In Progress' :
                    video.edit_status === 'revisions' ? 'Revisions' :
                    video.edit_status === 'done' ? 'Done' : 'Not Started'
                  return (
                    <div key={video.id}
                      className={`grid items-center hover:bg-[#252525] transition-colors ${idx < videos.length - 1 ? 'border-b border-[#2e2e2e]' : ''}`}
                      style={{ gridTemplateColumns: '1fr 130px 150px 110px' }}>
                      <div className="px-4 py-2.5">
                        <p className="text-sm text-[#e8e8e8] truncate">{video.title}</p>
                      </div>
                      <div className="px-4 py-2.5">
                        <span className="text-[11px] px-2 py-0.5 rounded font-medium" style={statusStyle}>{statusLabel}</span>
                      </div>
                      <div className="px-4 py-2.5 text-xs text-[#888]">
                        {editor?.full_name ?? <span className="text-[#555]">Unassigned</span>}
                      </div>
                      <div className="px-4 py-2.5 text-xs text-[#555]">
                        {video.posted_date ? formatDate(video.posted_date) : '—'}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── SHOOTS ── */}
        {tab === 'shoots' && (
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#e8e8e8]">{shoots.length} Shoots</h3>
              <span className="text-xs text-[#555]">{upcomingShoots.length} upcoming</span>
            </div>
            {shoots.length === 0 ? (
              <div className="text-center py-16 text-[#555]">
                <Calendar size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No shoots scheduled</p>
              </div>
            ) : (
              <div className="space-y-2">
                {shoots.map(shoot => {
                  const upcoming = new Date(shoot.shoot_date) >= new Date()
                  return (
                    <div key={shoot.id}
                      className={`bg-[#202020] border rounded-card p-4 flex items-start gap-3 ${upcoming ? 'border-[#2e2e2e]' : 'border-[#252525] opacity-60'}`}>
                      <div className="w-12 h-12 rounded-card flex flex-col items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${client.color}22` }}>
                        <span className="text-[10px] text-[#888]">
                          {new Date(shoot.shoot_date + 'T12:00:00').toLocaleString('en-US', { month: 'short' })}
                        </span>
                        <span className="text-base font-bold" style={{ color: client.color }}>
                          {new Date(shoot.shoot_date + 'T12:00:00').getDate()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[#e8e8e8]">
                            {new Date(shoot.shoot_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                          </span>
                          {upcoming && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#10b981]/15 text-[#10b981]">Upcoming</span>}
                        </div>
                        {shoot.shoot_time && <p className="text-xs text-[#888] mt-0.5">{shoot.shoot_time}</p>}
                        {shoot.location && <p className="text-xs text-[#555] mt-0.5">{shoot.location}</p>}
                        {shoot.notes && <p className="text-xs text-[#555] mt-1 italic">{shoot.notes}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── INVOICES ── */}
        {tab === 'invoices' && (
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <h3 className="text-sm font-semibold text-[#e8e8e8]">{invoices.length} Invoices</h3>
                <span className="text-xs text-[#10b981]">{formatCurrency(totalPaid)} paid</span>
                <span className="text-xs text-[#f59e0b]">{formatCurrency(outstanding)} outstanding</span>
              </div>
              <Button size="sm" onClick={() => setShowAddInvoice(true)}><Plus size={12} /> Add Invoice</Button>
            </div>

            {invoices.length === 0 ? (
              <div className="text-center py-16 text-[#555]">
                <DollarSign size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No invoices yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {invoices.map(inv => {
                  const overdue = inv.status !== 'paid' && inv.due_date && new Date(inv.due_date) < new Date()
                  return (
                    <div key={inv.id}
                      className={`bg-[#202020] border rounded-card p-4 ${overdue ? 'border-[#ef4444]/30' : 'border-[#2e2e2e]'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-base font-semibold text-[#e8e8e8]">{formatCurrency(inv.amount)}</span>
                          <Badge variant={inv.status as 'paid' | 'unpaid' | 'overdue'} />
                          {overdue && <span className="text-[10px] text-[#ef4444]">Overdue</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          {inv.pdf_url && (
                            <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-[#4f8ef7] hover:underline flex items-center gap-1">
                              PDF <ExternalLink size={10} />
                            </a>
                          )}
                          {inv.status !== 'paid' && (
                            <button onClick={() => markInvoicePaid(inv)}
                              className="text-xs text-[#888] hover:text-[#10b981] transition-colors">
                              Mark paid
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-[#555]">
                        <span>Created {formatDate(inv.created_at)}</span>
                        {inv.due_date && <span>Due {formatDate(inv.due_date)}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── SOCIAL ── */}
        {tab === 'social' && (
          <div className="max-w-3xl">
            <h3 className="text-sm font-semibold text-[#e8e8e8] mb-4">Social Stats</h3>
            {socialStats.length === 0 ? (
              <div className="text-center py-16 text-[#555]">
                <Users size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm mb-1">No social data yet</p>
                <p className="text-xs">Add handles and refresh stats on the Social page</p>
              </div>
            ) : (
              <div className="space-y-3">
                {socialStats.map((stat: any) => {
                  const platformIcons: Record<string, string> = { tiktok: '🎵', instagram: '📷', youtube: '▶️' }
                  const platformLabels: Record<string, string> = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' }
                  return (
                    <div key={stat.id} className="bg-[#202020] border border-[#2e2e2e] rounded-card p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span>{platformIcons[stat.platform] || '📱'}</span>
                        <span className="text-sm font-semibold text-[#e8e8e8]">{platformLabels[stat.platform] || stat.platform}</span>
                        <span className="text-xs text-[#555] ml-auto">
                          Updated {stat.refreshed_at ? new Date(stat.refreshed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        {[
                          { label: 'Followers', value: formatNum(stat.followers || 0), icon: Users },
                          { label: 'Avg Views', value: formatNum(stat.avg_views || 0), icon: Eye },
                          { label: 'Total Likes', value: formatNum(stat.total_likes || 0), icon: Heart },
                        ].map(({ label, value, icon: Icon }) => (
                          <div key={label} className="text-center">
                            <Icon size={14} className="mx-auto text-[#555] mb-1" />
                            <p className="text-base font-semibold text-[#e8e8e8]">{value}</p>
                            <p className="text-[10px] text-[#555]">{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Invoice Modal */}
      <Modal open={showAddInvoice} onClose={() => setShowAddInvoice(false)} title="Add Invoice">
        <div className="space-y-3">
          <Input label="Amount ($) *" type="number" value={invoiceForm.amount}
            onChange={e => setInvoiceForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" autoFocus />
          <Select label="Status" value={invoiceForm.status}
            onChange={e => setInvoiceForm(p => ({ ...p, status: e.target.value }))}>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </Select>
          <Input label="Due Date" type="date" value={invoiceForm.due_date}
            onChange={e => setInvoiceForm(p => ({ ...p, due_date: e.target.value }))} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setShowAddInvoice(false)}>Cancel</Button>
            <Button onClick={addInvoice} disabled={savingInvoice || !invoiceForm.amount}>
              {savingInvoice ? 'Saving…' : 'Add Invoice'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Video Modal */}
      <Modal open={showAddVideo} onClose={() => setShowAddVideo(false)} title="Add Video">
        <div className="space-y-3">
          <Input label="Title *" value={videoForm.title}
            onChange={e => setVideoForm(p => ({ ...p, title: e.target.value }))}
            placeholder="e.g. Best SUVs Under $40k" autoFocus />
          <Select label="Status" value={videoForm.edit_status}
            onChange={e => setVideoForm(p => ({ ...p, edit_status: e.target.value }))}>
            <option value="unassigned">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="revisions">Revisions</option>
            <option value="done">Done</option>
          </Select>
          <div>
            <label className="text-xs text-[#888] uppercase tracking-wide block mb-1">Editor</label>
            <select value={videoForm.assigned_editor_id}
              onChange={e => setVideoForm(p => ({ ...p, assigned_editor_id: e.target.value }))}
              className="w-full px-3 py-2 rounded-card bg-[#191919] border border-[#2e2e2e] text-[#e8e8e8] text-sm focus:outline-none focus:border-[#4f8ef7]">
              <option value="">Unassigned</option>
              {editors.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setShowAddVideo(false)}>Cancel</Button>
            <Button onClick={addVideo} disabled={savingVideo || !videoForm.title.trim()}>
              {savingVideo ? 'Saving…' : 'Add Video'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
