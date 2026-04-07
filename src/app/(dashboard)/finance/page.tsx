'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, TrendingUp, TrendingDown, DollarSign, AlertCircle, Trash2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { formatCurrency, formatDate } from '@/lib/utils'
import { logActivity } from '@/lib/activity'
import type { Invoice, Expense, Client } from '@/types/database'

const EXPENSE_CATEGORIES = ['Software', 'Contractor Pay', 'Equipment', 'Travel', 'Ads', 'Other'] as const

export default function FinancePage() {
  const supabase = createClient()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expenseForm, setExpenseForm] = useState({ date: new Date().toISOString().split('T')[0], category: 'Software', description: '', amount: '' })

  const fetchData = useCallback(async () => {
    const [{ data: invoicesData }, { data: expensesData }, { data: clientsData }] = await Promise.all([
      supabase.from('invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('expenses').select('*').order('date', { ascending: false }),
      supabase.from('clients').select('*').order('name'),
    ])
    setInvoices(invoicesData ?? [])
    setExpenses(expensesData ?? [])
    setClients(clientsData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]))

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

  const isThisMonth = (d: string) => { const dt = new Date(d); return dt >= startOfMonth && dt <= endOfMonth }
  const isLastMonth = (d: string) => { const dt = new Date(d); return dt >= lastMonthStart && dt <= lastMonthEnd }

  const paidThisMonth = invoices.filter(i => i.status === 'paid' && isThisMonth(i.created_at))
  const paidLastMonth = invoices.filter(i => i.status === 'paid' && isLastMonth(i.created_at))
  const revenueMTD = paidThisMonth.reduce((s, i) => s + i.amount, 0)
  const revenueLastMonth = paidLastMonth.reduce((s, i) => s + i.amount, 0)
  const expensesMTD = expenses.filter(e => isThisMonth(e.date)).reduce((s, e) => s + e.amount, 0)
  const netIncome = revenueMTD - expensesMTD
  const outstanding = invoices.filter(i => i.status !== 'paid')

  const revenueByClient = clients.map(c => ({
    name: c.name.split(' ')[0],
    fullName: c.name,
    amount: paidThisMonth.filter(i => i.client_id === c.id).reduce((s, i) => s + i.amount, 0),
    color: c.color,
  })).filter(d => d.amount > 0).sort((a, b) => b.amount - a.amount)

  const momChange = revenueLastMonth > 0 ? ((revenueMTD - revenueLastMonth) / revenueLastMonth) * 100 : 0

  async function addExpense() {
    if (!expenseForm.amount || !expenseForm.category) return
    setSaving(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('expenses') as any).insert({
      date: expenseForm.date,
      category: expenseForm.category as typeof EXPENSE_CATEGORIES[number],
      description: expenseForm.description || null,
      amount: parseFloat(expenseForm.amount),
    })
    setSaving(false)
    setShowAddExpense(false)
    setExpenseForm({ date: new Date().toISOString().split('T')[0], category: 'Software', description: '', amount: '' })
    fetchData()
  }

  async function deleteExpense(id: string) {
    await supabase.from('expenses').delete().eq('id', id)
    fetchData()
  }

  async function markInvoicePaid(inv: Invoice) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('invoices') as any).update({ status: 'paid' }).eq('id', inv.id)
    await logActivity('invoice_paid', `Invoice marked paid for ${clientMap[inv.client_id ?? '']?.name ?? 'client'}`, 'invoice', inv.id)
    fetchData()
  }

  if (loading) return <PageSpinner />

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: typeof revenueByClient[0] }[] }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-[#252525] border border-[#2e2e2e] rounded-card px-3 py-2">
        <p className="text-xs font-medium text-[#e8e8e8]">{payload[0].payload.fullName}</p>
        <p className="text-xs text-[#888]">{formatCurrency(payload[0].payload.amount)}</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-semibold text-[#e8e8e8] mb-6">Finance</h1>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#202020] border border-[#2e2e2e] rounded-card p-4">
          <p className="text-xs text-[#888] mb-1">Revenue MTD</p>
          <p className="text-2xl font-semibold text-[#e8e8e8]">{formatCurrency(revenueMTD)}</p>
          {revenueLastMonth > 0 && (
            <div className={`flex items-center gap-1 mt-1 text-xs ${momChange >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
              {momChange >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {Math.abs(momChange).toFixed(1)}% vs last month
            </div>
          )}
        </div>
        <div className="bg-[#202020] border border-[#2e2e2e] rounded-card p-4">
          <p className="text-xs text-[#888] mb-1">Expenses MTD</p>
          <p className="text-2xl font-semibold text-[#ef4444]">{formatCurrency(expensesMTD)}</p>
        </div>
        <div className="bg-[#202020] border border-[#2e2e2e] rounded-card p-4">
          <p className="text-xs text-[#888] mb-1">Net Income MTD</p>
          <p className={`text-2xl font-semibold ${netIncome >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>{formatCurrency(netIncome)}</p>
        </div>
        <div className="bg-[#202020] border border-[#2e2e2e] rounded-card p-4">
          <p className="text-xs text-[#888] mb-1">Outstanding</p>
          <p className="text-2xl font-semibold text-[#f59e0b]">{formatCurrency(outstanding.reduce((s, i) => s + i.amount, 0))}</p>
          <p className="text-xs text-[#888] mt-1">{outstanding.length} invoice{outstanding.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Revenue by client chart */}
        {revenueByClient.length > 0 && (
          <div className="bg-[#202020] border border-[#2e2e2e] rounded-card p-5">
            <p className="text-sm font-semibold text-[#e8e8e8] mb-4">Revenue by Client (MTD)</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={revenueByClient} layout="vertical" margin={{ left: 10, right: 10 }}>
                <XAxis type="number" tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff08' }} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {revenueByClient.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Outstanding invoices */}
        <div className="bg-[#202020] border border-[#2e2e2e] rounded-card p-5">
          <p className="text-sm font-semibold text-[#e8e8e8] mb-4">Outstanding Invoices</p>
          {outstanding.length === 0 ? (
            <p className="text-xs text-[#555] text-center py-8">All invoices paid.</p>
          ) : (
            <div className="space-y-2">
              {outstanding.map(inv => {
                const client = inv.client_id ? clientMap[inv.client_id] : null
                const daysOverdue = inv.due_date ? Math.ceil((new Date().getTime() - new Date(inv.due_date).getTime()) / 86400000) : null
                return (
                  <div key={inv.id} className="flex items-center justify-between p-3 border border-[#2e2e2e] rounded-card">
                    <div>
                      <p className="text-sm font-medium text-[#e8e8e8]">{client?.name ?? 'Unknown client'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant={inv.status as 'unpaid' | 'overdue'} />
                        {daysOverdue !== null && daysOverdue > 0 && (
                          <span className="flex items-center gap-1 text-xs text-[#ef4444]"><AlertCircle size={10} />{daysOverdue}d overdue</span>
                        )}
                        {inv.due_date && <span className="text-xs text-[#888]">Due {formatDate(inv.due_date)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-[#e8e8e8]">{formatCurrency(inv.amount)}</span>
                      <button onClick={() => markInvoicePaid(inv)} className="text-xs text-[#888] hover:text-[#10b981] transition-colors">Mark paid</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Expense tracking */}
        <div className="xl:col-span-2 bg-[#202020] border border-[#2e2e2e] rounded-card p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-[#e8e8e8]">Expense Tracking</p>
            <Button size="sm" onClick={() => setShowAddExpense(true)}><Plus size={14} /> Add Expense</Button>
          </div>
          {expenses.length === 0 ? (
            <p className="text-xs text-[#555] text-center py-8">No expenses logged.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2e2e2e]">
                    {['Date', 'Category', 'Description', 'Amount', ''].map(h => (
                      <th key={h} className="text-left text-[10px] font-medium text-[#888] uppercase tracking-wide py-2 px-2 first:pl-0">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(exp => (
                    <tr key={exp.id} className="border-b border-[#2e2e2e] hover:bg-[#252525] group">
                      <td className="py-2.5 px-2 first:pl-0 text-xs text-[#888]">{formatDate(exp.date)}</td>
                      <td className="py-2.5 px-2"><Badge variant="default" label={exp.category} /></td>
                      <td className="py-2.5 px-2 text-xs text-[#e8e8e8] max-w-xs truncate">{exp.description || '—'}</td>
                      <td className="py-2.5 px-2 text-xs font-medium text-[#ef4444]">{formatCurrency(exp.amount)}</td>
                      <td className="py-2.5 px-2">
                        <button onClick={() => deleteExpense(exp.id)} className="opacity-0 group-hover:opacity-100 p-1 text-[#888] hover:text-[#ef4444]"><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal open={showAddExpense} onClose={() => setShowAddExpense(false)} title="Add Expense">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Date" type="date" value={expenseForm.date} onChange={e => setExpenseForm(p => ({ ...p, date: e.target.value }))} />
            <Input label="Amount ($) *" type="number" value={expenseForm.amount} onChange={e => setExpenseForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
          </div>
          <Select label="Category *" value={expenseForm.category} onChange={e => setExpenseForm(p => ({ ...p, category: e.target.value }))}>
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Input label="Description" value={expenseForm.description} onChange={e => setExpenseForm(p => ({ ...p, description: e.target.value }))} placeholder="What was this for?" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAddExpense(false)}>Cancel</Button>
            <Button onClick={addExpense} disabled={saving || !expenseForm.amount}>{saving ? 'Saving…' : 'Add Expense'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
