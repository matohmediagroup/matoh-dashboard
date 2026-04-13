'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, TrendingUp, TrendingDown, AlertCircle, Trash2, Eye, EyeOff } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { formatCurrency, formatDate } from '@/lib/utils'
import { logActivity } from '@/lib/activity'
import type { Invoice, Expense, Client } from '@/types/database'

const EXPENSE_CATEGORIES = ['Software', 'Contractor Pay', 'Equipment', 'Travel', 'Ads', 'Other'] as const

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function get6MonthLabels(): { key: string; label: string; year: number; month: number }[] {
  const now = new Date()
  const result = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: MONTH_NAMES[d.getMonth()],
      year: d.getFullYear(),
      month: d.getMonth(),
    })
  }
  return result
}

export default function FinancePage() {
  const supabase = createClient()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  // Add Expense modal
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [savingExpense, setSavingExpense] = useState(false)
  const [expenseForm, setExpenseForm] = useState({
    date: new Date().toISOString().split('T')[0],
    category: 'Software',
    description: '',
    amount: '',
  })

  // Add Invoice modal
  const [showAddInvoice, setShowAddInvoice] = useState(false)
  const [savingInvoice, setSavingInvoice] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState({
    client_id: '',
    amount: '',
    due_date: '',
    status: 'unpaid',
  })

  // Invoice section state
  const [showPaidInvoices, setShowPaidInvoices] = useState(false)

  // Expense filter
  const [expenseMonthFilter, setExpenseMonthFilter] = useState<string>('all')

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

  // KPI calculations
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
  const momChange = revenueLastMonth > 0 ? ((revenueMTD - revenueLastMonth) / revenueLastMonth) * 100 : 0

  // Revenue by client (MTD) for existing chart
  const revenueByClient = clients.map(c => ({
    name: c.name.split(' ')[0],
    fullName: c.name,
    amount: paidThisMonth.filter(i => i.client_id === c.id).reduce((s, i) => s + i.amount, 0),
    color: c.color,
  })).filter(d => d.amount > 0).sort((a, b) => b.amount - a.amount)

  // 6-month revenue chart data
  const sixMonthLabels = get6MonthLabels()
  const revenueByMonth = sixMonthLabels.map(({ key, label, year, month }) => {
    const total = invoices
      .filter(i => {
        if (i.status !== 'paid') return false
        const d = new Date(i.created_at)
        return d.getFullYear() === year && d.getMonth() === month
      })
      .reduce((s, i) => s + i.amount, 0)
    return { key, label, amount: total }
  })

  // Expense month filter options
  const expenseMonthOptions = (() => {
    const seen = new Set<string>()
    const opts: { value: string; label: string }[] = [{ value: 'all', label: 'All months' }]
    expenses.forEach(e => {
      const d = new Date(e.date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!seen.has(key)) {
        seen.add(key)
        opts.push({ value: key, label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` })
      }
    })
    return opts
  })()

  const filteredExpenses = expenseMonthFilter === 'all'
    ? expenses
    : expenses.filter(e => {
      const d = new Date(e.date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      return key === expenseMonthFilter
    })

  // Category totals for filtered expenses
  const categoryTotals = EXPENSE_CATEGORIES.map(cat => ({
    category: cat,
    total: filteredExpenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter(c => c.total > 0)

  // Invoice display list
  const displayedInvoices = showPaidInvoices ? invoices : invoices.filter(i => i.status !== 'paid')

  async function addExpense() {
    if (!expenseForm.amount || !expenseForm.category) return
    setSavingExpense(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('expenses') as any).insert({
      date: expenseForm.date,
      category: expenseForm.category as typeof EXPENSE_CATEGORIES[number],
      description: expenseForm.description || null,
      amount: parseFloat(expenseForm.amount),
    })
    setSavingExpense(false)
    setShowAddExpense(false)
    setExpenseForm({ date: new Date().toISOString().split('T')[0], category: 'Software', description: '', amount: '' })
    fetchData()
  }

  async function addInvoice() {
    if (!invoiceForm.client_id || !invoiceForm.amount) return
    setSavingInvoice(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('invoices') as any).insert({
      client_id: invoiceForm.client_id,
      amount: parseFloat(invoiceForm.amount),
      status: invoiceForm.status,
      due_date: invoiceForm.due_date || null,
    })
    const client = clientMap[invoiceForm.client_id]
    await logActivity('invoice_created', `Invoice created for ${client?.name ?? 'client'}`, 'invoice', undefined)
    setSavingInvoice(false)
    setShowAddInvoice(false)
    setInvoiceForm({ client_id: '', amount: '', due_date: '', status: 'unpaid' })
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

  const CustomTooltipClient = ({ active, payload }: { active?: boolean; payload?: { payload: typeof revenueByClient[0] }[] }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-[#252525] border border-[#2e2e2e] rounded-card px-3 py-2">
        <p className="text-xs font-medium text-[#e8e8e8]">{payload[0].payload.fullName}</p>
        <p className="text-xs text-[#888]">{formatCurrency(payload[0].payload.amount)}</p>
      </div>
    )
  }

  const CustomTooltipMonth = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-[#252525] border border-[#2e2e2e] rounded-card px-3 py-2">
        <p className="text-xs font-medium text-[#e8e8e8]">{label}</p>
        <p className="text-xs text-[#888]">{formatCurrency(payload[0].value)}</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-[#e8e8e8]">Finance</h1>
        <Button size="sm" onClick={() => setShowAddInvoice(true)}>
          <Plus size={14} /> Add Invoice
        </Button>
      </div>

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

      {/* 6-month revenue bar chart — full width */}
      <div className="bg-[#202020] border border-[#2e2e2e] rounded-card p-5 mb-6">
        <p className="text-sm font-semibold text-[#e8e8e8] mb-4">Revenue — Last 6 Months</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={revenueByMonth} margin={{ left: 0, right: 10, top: 4, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={48} />
            <Tooltip content={<CustomTooltipMonth />} cursor={{ fill: '#ffffff08' }} />
            <Bar dataKey="amount" radius={[4, 4, 0, 0]} fill="#4f8ef7">
              {revenueByMonth.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.key === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` ? '#4f8ef7' : '#4f8ef755'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
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
                <Tooltip content={<CustomTooltipClient />} cursor={{ fill: '#ffffff08' }} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {revenueByClient.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Invoices section */}
        <div className="bg-[#202020] border border-[#2e2e2e] rounded-card p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-[#e8e8e8]">
              {showPaidInvoices ? 'All Invoices' : 'Outstanding Invoices'}
            </p>
            <button
              onClick={() => setShowPaidInvoices(p => !p)}
              className="flex items-center gap-1.5 text-xs text-[#888] hover:text-[#e8e8e8] transition-colors"
            >
              {showPaidInvoices ? <EyeOff size={13} /> : <Eye size={13} />}
              {showPaidInvoices ? 'Hide paid' : 'Show paid'}
            </button>
          </div>
          {displayedInvoices.length === 0 ? (
            <p className="text-xs text-[#555] text-center py-8">
              {showPaidInvoices ? 'No invoices yet.' : 'All invoices paid.'}
            </p>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {displayedInvoices.map(inv => {
                const client = inv.client_id ? clientMap[inv.client_id] : null
                const isPastDue = inv.status !== 'paid' && inv.due_date && new Date(inv.due_date) < now
                const daysOverdue = inv.due_date ? Math.ceil((now.getTime() - new Date(inv.due_date).getTime()) / 86400000) : null
                return (
                  <div
                    key={inv.id}
                    className={`flex items-center justify-between p-3 border rounded-card ${isPastDue ? 'border-[#ef4444]/40 bg-[#ef4444]/5' : 'border-[#2e2e2e]'}`}
                  >
                    <div>
                      <p className={`text-sm font-medium ${isPastDue ? 'text-[#ef4444]' : 'text-[#e8e8e8]'}`}>
                        {client?.name ?? 'Unknown client'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <Badge variant={inv.status as 'unpaid' | 'paid' | 'overdue'} />
                        {isPastDue && daysOverdue !== null && daysOverdue > 0 && (
                          <span className="flex items-center gap-1 text-xs text-[#ef4444]">
                            <AlertCircle size={10} />{daysOverdue}d overdue
                          </span>
                        )}
                        {inv.due_date && (
                          <span className="text-xs text-[#888]">Due {formatDate(inv.due_date)}</span>
                        )}
                        <span className="text-xs text-[#555]">Created {formatDate(inv.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-2 shrink-0">
                      <span className="text-sm font-semibold text-[#e8e8e8]">{formatCurrency(inv.amount)}</span>
                      {inv.status !== 'paid' && (
                        <button
                          onClick={() => markInvoicePaid(inv)}
                          className="text-xs text-[#888] hover:text-[#10b981] transition-colors whitespace-nowrap"
                        >
                          Mark paid
                        </button>
                      )}
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
            <div className="flex items-center gap-2">
              <Select
                value={expenseMonthFilter}
                onChange={e => setExpenseMonthFilter(e.target.value)}
                className="text-xs h-8 py-0"
              >
                {expenseMonthOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
              <Button size="sm" onClick={() => setShowAddExpense(true)}>
                <Plus size={14} /> Add Expense
              </Button>
            </div>
          </div>

          {/* Category summary chips */}
          {categoryTotals.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {categoryTotals.map(({ category, total }) => (
                <div key={category} className="flex items-center gap-1.5 bg-[#2a2a2a] border border-[#2e2e2e] rounded-chip px-2.5 py-1">
                  <span className="text-xs text-[#888]">{category}</span>
                  <span className="text-xs font-medium text-[#ef4444]">{formatCurrency(total)}</span>
                </div>
              ))}
            </div>
          )}

          {filteredExpenses.length === 0 ? (
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
                  {filteredExpenses.map(exp => (
                    <tr key={exp.id} className="border-b border-[#2e2e2e] hover:bg-[#252525] group">
                      <td className="py-2.5 px-2 first:pl-0 text-xs text-[#888]">{formatDate(exp.date)}</td>
                      <td className="py-2.5 px-2"><Badge variant="default" label={exp.category} /></td>
                      <td className="py-2.5 px-2 text-xs text-[#e8e8e8] max-w-xs truncate">{exp.description || '—'}</td>
                      <td className="py-2.5 px-2 text-xs font-medium text-[#ef4444]">{formatCurrency(exp.amount)}</td>
                      <td className="py-2.5 px-2">
                        <button
                          onClick={() => deleteExpense(exp.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-[#888] hover:text-[#ef4444]"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add Invoice Modal */}
      <Modal open={showAddInvoice} onClose={() => setShowAddInvoice(false)} title="Add Invoice">
        <div className="space-y-3">
          <Select
            label="Client *"
            value={invoiceForm.client_id}
            onChange={e => setInvoiceForm(p => ({ ...p, client_id: e.target.value }))}
          >
            <option value="">Select a client…</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Amount ($) *"
              type="number"
              value={invoiceForm.amount}
              onChange={e => setInvoiceForm(p => ({ ...p, amount: e.target.value }))}
              placeholder="0.00"
            />
            <Input
              label="Due Date"
              type="date"
              value={invoiceForm.due_date}
              onChange={e => setInvoiceForm(p => ({ ...p, due_date: e.target.value }))}
            />
          </div>
          <Select
            label="Status"
            value={invoiceForm.status}
            onChange={e => setInvoiceForm(p => ({ ...p, status: e.target.value }))}
          >
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAddInvoice(false)}>Cancel</Button>
            <Button onClick={addInvoice} disabled={savingInvoice || !invoiceForm.client_id || !invoiceForm.amount}>
              {savingInvoice ? 'Saving…' : 'Add Invoice'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Expense Modal */}
      <Modal open={showAddExpense} onClose={() => setShowAddExpense(false)} title="Add Expense">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Date"
              type="date"
              value={expenseForm.date}
              onChange={e => setExpenseForm(p => ({ ...p, date: e.target.value }))}
            />
            <Input
              label="Amount ($) *"
              type="number"
              value={expenseForm.amount}
              onChange={e => setExpenseForm(p => ({ ...p, amount: e.target.value }))}
              placeholder="0.00"
            />
          </div>
          <Select
            label="Category *"
            value={expenseForm.category}
            onChange={e => setExpenseForm(p => ({ ...p, category: e.target.value }))}
          >
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Input
            label="Description"
            value={expenseForm.description}
            onChange={e => setExpenseForm(p => ({ ...p, description: e.target.value }))}
            placeholder="What was this for?"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAddExpense(false)}>Cancel</Button>
            <Button onClick={addExpense} disabled={savingExpense || !expenseForm.amount}>
              {savingExpense ? 'Saving…' : 'Add Expense'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
