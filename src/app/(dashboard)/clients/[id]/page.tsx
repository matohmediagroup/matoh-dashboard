'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Upload, Plus, AlertTriangle, ExternalLink, Pencil, Check, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, daysUntil } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageSpinner } from '@/components/ui/Spinner'
import { logActivity } from '@/lib/activity'
import type { Client, Invoice } from '@/types/database'

export default function ClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const id = params.id as string

  const [client, setClient] = useState<Client | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showAddInvoice, setShowAddInvoice] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState({ amount: '', status: 'unpaid', due_date: '' })
  const [savingInvoice, setSavingInvoice] = useState(false)

  async function fetchData() {
    const [{ data: clientData }, { data: invoiceData }] = await Promise.all([
      supabase.from('clients').select('*').eq('id', id).single(),
      supabase.from('invoices').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    ])
    setClient(clientData)
    setInvoices(invoiceData ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [id])

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
    await supabase.from('invoices').insert({
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

  async function markInvoicePaid(invoice: Invoice) {
    await supabase.from('invoices').update({ status: 'paid' }).eq('id', invoice.id)
    await logActivity('invoice_paid', `Invoice marked paid for ${client?.name}`, 'invoice', invoice.id)
    fetchData()
  }

  async function uploadContractPDF(file: File) {
    const path = `contracts/${id}/${file.name}`
    const { error } = await supabase.storage.from('contracts').upload(path, file, { upsert: true })
    if (error) return
    const { data: { publicUrl } } = supabase.storage.from('contracts').getPublicUrl(path)
    await saveField('contract_url', publicUrl)
  }

  if (loading) return <PageSpinner />
  if (!client) return <div className="p-6 text-[#888]">Client not found.</div>

  const renewalDays = client.contract_auto_renewal ? daysUntil(client.contract_auto_renewal) : null

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-1.5 rounded-card text-[#888] hover:text-[#e8e8e8] hover:bg-[#252525] transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-card flex items-center justify-center font-bold text-sm" style={{ backgroundColor: `${client.color}22`, color: client.color }}>
            {client.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[#e8e8e8]">{client.name}</h1>
            <Badge variant={client.status as 'active' | 'inactive'} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Info + Contract */}
        <div className="lg:col-span-2 space-y-4">
          {/* Info Section */}
          <section className="bg-[#202020] border border-[#2e2e2e] rounded-card p-5">
            <h2 className="text-sm font-semibold text-[#e8e8e8] mb-4">Client Info</h2>
            <div className="space-y-3">
              {[
                { label: 'Contact Name', field: 'contact_name', value: client.contact_name },
                { label: 'Email', field: 'contact_email', value: client.contact_email },
                { label: 'Phone', field: 'contact_phone', value: client.contact_phone },
                { label: 'Monthly Retainer', field: 'monthly_retainer', value: client.monthly_retainer ? formatCurrency(client.monthly_retainer) : null, rawValue: String(client.monthly_retainer ?? '') },
              ].map(({ label, field, value, rawValue }) => (
                <div key={field} className="flex items-center justify-between py-1 border-b border-[#2e2e2e] last:border-0">
                  <span className="text-xs text-[#888] w-36 flex-shrink-0">{label}</span>
                  {editingField === field ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        autoFocus
                        className="flex-1 px-2 py-1 rounded-chip bg-[#191919] border border-[#4f8ef7] text-[#e8e8e8] text-sm focus:outline-none"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveField(field, field === 'monthly_retainer' ? parseFloat(editValue) : editValue)
                          if (e.key === 'Escape') setEditingField(null)
                        }}
                      />
                      <button onClick={() => saveField(field, field === 'monthly_retainer' ? parseFloat(editValue) : editValue)} className="text-[#10b981]"><Check size={14} /></button>
                      <button onClick={() => setEditingField(null)} className="text-[#888]"><X size={14} /></button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingField(field); setEditValue(rawValue ?? value ?? '') }}
                      className="flex items-center gap-2 text-sm text-[#e8e8e8] hover:text-[#4f8ef7] group transition-colors"
                    >
                      <span>{value || <span className="text-[#555]">—</span>}</span>
                      <Pencil size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between py-1">
                <span className="text-xs text-[#888] w-36 flex-shrink-0">Status</span>
                <select
                  value={client.status}
                  onChange={e => saveField('status', e.target.value)}
                  className="text-sm bg-transparent text-[#e8e8e8] focus:outline-none cursor-pointer"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </section>

          {/* Contract Section */}
          <section className="bg-[#202020] border border-[#2e2e2e] rounded-card p-5">
            <h2 className="text-sm font-semibold text-[#e8e8e8] mb-4">Contract</h2>

            {renewalDays !== null && renewalDays <= 30 && (
              <div className="flex items-center gap-2 bg-[#f59e0b]/10 border border-[#f59e0b]/20 rounded-card px-3 py-2 mb-4">
                <AlertTriangle size={14} className="text-[#f59e0b] flex-shrink-0" />
                <p className="text-xs text-[#f59e0b]">
                  Auto-renewal in <strong>{renewalDays}</strong> day{renewalDays !== 1 ? 's' : ''} ({formatDate(client.contract_auto_renewal!)})
                </p>
              </div>
            )}

            <div className="space-y-3">
              {[
                { label: 'Start Date', field: 'contract_start', type: 'date', value: client.contract_start },
                { label: 'End Date', field: 'contract_end', type: 'date', value: client.contract_end },
                { label: 'Auto-Renewal', field: 'contract_auto_renewal', type: 'date', value: client.contract_auto_renewal },
              ].map(({ label, field, type, value }) => (
                <div key={field} className="flex items-center justify-between py-1 border-b border-[#2e2e2e] last:border-0">
                  <span className="text-xs text-[#888] w-36 flex-shrink-0">{label}</span>
                  {editingField === field ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        autoFocus
                        type={type}
                        className="flex-1 px-2 py-1 rounded-chip bg-[#191919] border border-[#4f8ef7] text-[#e8e8e8] text-sm focus:outline-none"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                      />
                      <button onClick={() => saveField(field, editValue || null)} className="text-[#10b981]"><Check size={14} /></button>
                      <button onClick={() => setEditingField(null)} className="text-[#888]"><X size={14} /></button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingField(field); setEditValue(value ?? '') }}
                      className="flex items-center gap-2 text-sm text-[#e8e8e8] hover:text-[#4f8ef7] group"
                    >
                      <span>{value ? formatDate(value) : <span className="text-[#555]">—</span>}</span>
                      <Pencil size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}
                </div>
              ))}

              {/* Contract PDF */}
              <div className="flex items-center justify-between py-1">
                <span className="text-xs text-[#888] w-36 flex-shrink-0">Contract PDF</span>
                <div className="flex items-center gap-2">
                  {client.contract_url && (
                    <a href={client.contract_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-[#4f8ef7] hover:underline">
                      View <ExternalLink size={12} />
                    </a>
                  )}
                  <label className="flex items-center gap-1 text-xs text-[#888] hover:text-[#e8e8e8] cursor-pointer">
                    <Upload size={12} />
                    {client.contract_url ? 'Replace' : 'Upload'}
                    <input type="file" accept=".pdf" className="hidden"
                      onChange={e => e.target.files?.[0] && uploadContractPDF(e.target.files[0])} />
                  </label>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="mt-4">
              <p className="text-xs text-[#888] mb-2">Notes</p>
              <Textarea
                value={client.notes ?? ''}
                onChange={e => setClient(prev => prev ? { ...prev, notes: e.target.value } : null)}
                onBlur={e => saveField('notes', e.target.value)}
                rows={3}
                placeholder="Add notes…"
              />
            </div>
          </section>
        </div>

        {/* Right: Invoice History */}
        <div>
          <section className="bg-[#202020] border border-[#2e2e2e] rounded-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[#e8e8e8]">Invoices</h2>
              <Button size="sm" onClick={() => setShowAddInvoice(true)}>
                <Plus size={12} /> Add
              </Button>
            </div>

            {invoices.length === 0 ? (
              <p className="text-xs text-[#555] text-center py-4">No invoices yet.</p>
            ) : (
              <div className="space-y-2">
                {invoices.map(inv => (
                  <div key={inv.id} className="border border-[#2e2e2e] rounded-card p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-[#e8e8e8]">{formatCurrency(inv.amount)}</span>
                      <Badge variant={inv.status as 'paid' | 'unpaid' | 'overdue'} />
                    </div>
                    {inv.due_date && (
                      <p className="text-xs text-[#888] mb-2">Due {formatDate(inv.due_date)}</p>
                    )}
                    <div className="flex items-center gap-2">
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
                ))}
              </div>
            )}

            {/* Totals */}
            {invoices.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[#2e2e2e] space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-[#888]">Total paid</span>
                  <span className="text-[#10b981]">{formatCurrency(invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0))}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#888]">Outstanding</span>
                  <span className="text-[#f59e0b]">{formatCurrency(invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + i.amount, 0))}</span>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Add Invoice Modal */}
      <Modal open={showAddInvoice} onClose={() => setShowAddInvoice(false)} title="Add Invoice">
        <div className="space-y-4">
          <Input label="Amount ($) *" type="number" value={invoiceForm.amount} onChange={e => setInvoiceForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
          <Select label="Status" value={invoiceForm.status} onChange={e => setInvoiceForm(p => ({ ...p, status: e.target.value }))}>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </Select>
          <Input label="Due Date" type="date" value={invoiceForm.due_date} onChange={e => setInvoiceForm(p => ({ ...p, due_date: e.target.value }))} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAddInvoice(false)}>Cancel</Button>
            <Button onClick={addInvoice} disabled={savingInvoice || !invoiceForm.amount}>
              {savingInvoice ? 'Saving…' : 'Add Invoice'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
