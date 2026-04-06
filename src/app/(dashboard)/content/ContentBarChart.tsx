'use client'

import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { ContentItem, Client } from '@/types/database'

interface Props {
  items: ContentItem[]
  clients: Client[]
}

export function ContentBarChart({ items, clients }: Props) {
  const [subtab, setSubtab] = useState<'mtd' | 'month'>('mtd')

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const filteredItems = items.filter(i => {
    if (!i.posted_date) return false
    const d = new Date(i.posted_date)
    if (subtab === 'mtd') return d >= startOfMonth && d <= now
    return d >= startOfMonth && d <= endOfMonth
  })

  const data = clients.map(client => ({
    name: client.name.split(' ')[0],
    fullName: client.name,
    count: filteredItems.filter(i => i.client_id === client.id).length,
    color: client.color,
  })).filter(d => d.count > 0).sort((a, b) => b.count - a.count)

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: typeof data[0] }[] }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="bg-[#252525] border border-[#2e2e2e] rounded-card px-3 py-2">
        <p className="text-xs font-medium text-[#e8e8e8]">{d.fullName}</p>
        <p className="text-xs text-[#888]">{d.count} video{d.count !== 1 ? 's' : ''}</p>
      </div>
    )
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="flex items-center gap-1 mb-6">
        {([
          { id: 'mtd', label: `MTD (${now.toLocaleString('default', { month: 'short' })} 1–${now.getDate()})` },
          { id: 'month', label: `Full Month (${now.toLocaleString('default', { month: 'long' })})` },
        ] as const).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setSubtab(id)}
            className={`px-3 py-1.5 rounded-card text-xs font-medium transition-colors ${subtab === id ? 'bg-[#202020] text-[#e8e8e8] border border-[#2e2e2e]' : 'text-[#888] hover:text-[#e8e8e8]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {data.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-[#888] text-sm">No data for this period.</div>
      ) : (
        <div className="bg-[#202020] border border-[#2e2e2e] rounded-card p-6">
          <p className="text-sm font-medium text-[#e8e8e8] mb-6">Content by Client</p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <XAxis dataKey="name" tick={{ fill: '#888', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#888', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff08' }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
