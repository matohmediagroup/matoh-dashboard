'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Building2, Mail, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageSpinner } from '@/components/ui/Spinner'
import type { Client } from '@/types/database'

const CLIENT_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#f97316', '#14b8a6', '#ef4444', '#6366f1',
]

function getContractBadge(contractEnd: string | null | undefined): { label: string; style: string } | null {
  if (!contractEnd) return null
  const end = new Date(contractEnd)
  const now = new Date()
  const diffDays = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  if (diffDays < 0) return { label: 'Expired', style: 'bg-[#3d1a1a] text-[#ef4444]' }
  if (diffDays <= 60) return { label: 'Expiring Soon', style: 'bg-[#3d2e00] text-[#f59e0b]' }
  return null
}

export default function ClientsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '', contact_name: '', contact_email: '', contact_phone: '',
    monthly_retainer: '', status: 'active', color: CLIENT_COLORS[0], notes: '',
    contract_start: '', contract_end: '',
  })

  async function fetchClients() {
    const { data } = await supabase.from('clients').select('*').order('name')
    setClients(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchClients() }, [])

  async function handleAdd() {
    if (!form.name.trim()) return
    setSaving(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('clients') as any).insert({
      name: form.name,
      contact_name: form.contact_name || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      monthly_retainer: parseFloat(form.monthly_retainer) || 0,
      status: form.status as 'active' | 'inactive',
      color: form.color,
      notes: form.notes || null,
      contract_start: form.contract_start || null,
      contract_end: form.contract_end || null,
    })
    setSaving(false)
    setShowAdd(false)
    setForm({ name: '', contact_name: '', contact_email: '', contact_phone: '', monthly_retainer: '', status: 'active', color: CLIENT_COLORS[0], notes: '', contract_start: '', contract_end: '' })
    fetchClients()
  }

  if (loading) return <PageSpinner />

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#e8e8e8]">Clients</h1>
          <p className="text-sm text-[#888] mt-0.5">{clients.filter(c => c.status === 'active').length} active</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus size={16} /> Add Client
        </Button>
      </div>

      {clients.length === 0 ? (
        <div className="text-center py-20 text-[#888]">
          <Building2 size={40} className="mx-auto mb-3 opacity-30" />
          <p>No clients yet. Add your first client.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {clients.map((client) => {
            const contractBadge = getContractBadge((client as any).contract_end)
            return (
              <button
                key={client.id}
                onClick={() => router.push(`/clients/${client.id}`)}
                className="bg-[#202020] border border-[#2e2e2e] rounded-card p-5 text-left hover:border-[#3a3a3a] transition-colors group"
              >
                {/* Color bar */}
                <div className="h-1 rounded-full mb-4" style={{ backgroundColor: client.color }} />

                {/* Logo placeholder / initials */}
                {client.logo_url ? (
                  <img src={client.logo_url} alt={client.name} className="w-10 h-10 rounded-card object-cover mb-3" />
                ) : (
                  <div
                    className="w-10 h-10 rounded-card flex items-center justify-center text-sm font-bold mb-3"
                    style={{ backgroundColor: `${client.color}22`, color: client.color }}
                  >
                    {client.name.charAt(0)}
                  </div>
                )}

                <h3 className="font-medium text-[#e8e8e8] text-sm mb-1 group-hover:text-white transition-colors truncate">
                  {client.name}
                </h3>

                {/* Contact info */}
                {client.contact_name && (
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <User size={10} className="text-[#555] flex-shrink-0" />
                    <p className="text-xs text-[#888] truncate">{client.contact_name}</p>
                  </div>
                )}
                {client.contact_email && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <Mail size={10} className="text-[#555] flex-shrink-0" />
                    <p className="text-xs text-[#555] truncate">{client.contact_email}</p>
                  </div>
                )}
                {!client.contact_name && !client.contact_email && (
                  <p className="text-xs text-[#888] mb-2">—</p>
                )}

                {/* Monthly retainer */}
                <p className="text-lg font-semibold text-[#e8e8e8] mb-3">
                  {formatCurrency(client.monthly_retainer)}<span className="text-[#555] text-xs font-normal">/mo</span>
                </p>

                {/* Badges row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={client.status as 'active' | 'inactive'} />
                  {contractBadge && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${contractBadge.style}`}>
                      {contractBadge.label}
                    </span>
                  )}
                </div>

                {/* Contract end date hint */}
                {(client as any).contract_end && (
                  <p className="text-[10px] text-[#555] mt-2">
                    Contract ends {new Date((client as any).contract_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Add Client Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Client" width="lg">
        <div className="space-y-4">
          <Input label="Client Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Volkswagen Pacific" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Contact Name" value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} />
            <Input label="Monthly Retainer ($)" type="number" value={form.monthly_retainer} onChange={e => setForm(p => ({ ...p, monthly_retainer: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email" type="email" value={form.contact_email} onChange={e => setForm(p => ({ ...p, contact_email: e.target.value }))} />
            <Input label="Phone" value={form.contact_phone} onChange={e => setForm(p => ({ ...p, contact_phone: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Contract Start Date" type="date" value={form.contract_start} onChange={e => setForm(p => ({ ...p, contract_start: e.target.value }))} />
            <Input label="Contract End Date" type="date" value={form.contract_end} onChange={e => setForm(p => ({ ...p, contract_end: e.target.value }))} />
          </div>
          <Select label="Status" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
          <div>
            <p className="text-xs font-medium text-[#888] mb-2">Color</p>
            <div className="flex gap-2 flex-wrap">
              {CLIENT_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setForm(p => ({ ...p, color: c }))}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                  style={{ backgroundColor: c, outline: form.color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }}
                />
              ))}
            </div>
          </div>
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving…' : 'Add Client'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
