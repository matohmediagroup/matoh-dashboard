'use client'

import type { ContentItem, Client, Profile } from '@/types/database'

interface Props {
  items: ContentItem[]
  clients: Client[]
  editors: Profile[]
}

export function MetricsStrip({ items, clients, editors }: Props) {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const mtdItems = items.filter(i => {
    if (!i.posted_date) return false
    const d = new Date(i.posted_date)
    return d >= startOfMonth && d <= endOfMonth
  })

  const postedMTD = mtdItems.filter(i => i.edit_status === 'done')
  const totalScheduled = mtdItems.length
  const completionRate = totalScheduled > 0 ? Math.round((postedMTD.length / totalScheduled) * 100) : 0

  return (
    <div className="px-6 py-3 border-b border-[#2e2e2e] bg-[#191919] flex-shrink-0">
      <div className="flex items-start gap-6 overflow-x-auto pb-1">
        {/* Per-client posted MTD */}
        <div>
          <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1.5">Posted MTD by Client</p>
          <div className="flex gap-2 flex-wrap">
            {clients.map(client => {
              const count = postedMTD.filter(i => i.client_id === client.id).length
              return (
                <div key={client.id} className="flex items-center gap-1.5 px-2 py-1 rounded-chip border border-[#2e2e2e] bg-[#202020]">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: client.color }} />
                  <span className="text-xs text-[#888] whitespace-nowrap">{client.name.split(' ')[0]}</span>
                  <span className="text-xs font-semibold text-[#e8e8e8]">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Editor load */}
        <div>
          <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1.5">Editor Load</p>
          <div className="flex gap-2 flex-wrap">
            {editors.map(editor => {
              const count = items.filter(i => i.assigned_editor_id === editor.id && i.edit_status !== 'done').length
              return (
                <div key={editor.id} className="flex items-center gap-1.5 px-2 py-1 rounded-chip border border-[#2e2e2e] bg-[#202020]">
                  <span className="text-xs text-[#888]">{editor.full_name.split(' ')[0]}</span>
                  <span className="text-xs font-semibold text-[#e8e8e8]">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Completion rate */}
        <div className="min-w-[160px]">
          <p className="text-[10px] text-[#888] uppercase tracking-wide mb-1.5">
            MTD Completion — {postedMTD.length}/{totalScheduled} ({completionRate}%)
          </p>
          <div className="h-2 bg-[#2e2e2e] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#4f8ef7] rounded-full transition-all"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
