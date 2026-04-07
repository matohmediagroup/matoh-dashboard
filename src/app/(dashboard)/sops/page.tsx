'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, FileText, ExternalLink, Trash2, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'

const CATEGORIES = ['Filming', 'Editing', 'Client', 'Operations', 'Onboarding', 'Other'] as const
type Category = typeof CATEGORIES[number]

interface SOP {
  id: string
  title: string
  category: Category
  description: string | null
  pdf_url: string | null
  created_at: string
}

const CATEGORY_COLORS: Record<Category, string> = {
  Filming:    '#4f8ef7',
  Editing:    '#8b5cf6',
  Client:     '#10b981',
  Operations: '#f59e0b',
  Onboarding: '#ec4899',
  Other:      '#6b7280',
}

export default function SOPsPage() {
  const supabase = createClient()
  const [sops, setSops] = useState<SOP[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>('all')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', category: 'Filming' as Category, description: '', pdf_url: '' })

  const fetchData = useCallback(async () => {
    const { data } = await supabase.from('sops').select('*').order('category').order('title')
    setSops((data ?? []) as SOP[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function uploadPDF(file: File) {
    setUploading(true)
    const path = `sops/${Date.now()}-${file.name.replace(/\s+/g, '-')}`
    const { error } = await supabase.storage.from('sops').upload(path, file, { upsert: false })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('sops').getPublicUrl(path)
      setForm(p => ({ ...p, pdf_url: publicUrl }))
    }
    setUploading(false)
  }

  async function addSOP() {
    if (!form.title.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('sops') as any).insert({
      title: form.title,
      category: form.category,
      description: form.description || null,
      pdf_url: form.pdf_url || null,
      created_by: user?.id ?? null,
    })
    setSaving(false)
    setShowAdd(false)
    setForm({ title: '', category: 'Filming', description: '', pdf_url: '' })
    fetchData()
  }

  async function deleteSOP(id: string) {
    await supabase.from('sops').delete().eq('id', id)
    fetchData()
  }

  if (loading) return <PageSpinner />

  const grouped = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = sops.filter(s => s.category === cat)
    return acc
  }, {} as Record<Category, SOP[]>)

  const filtered = filterCategory === 'all' ? sops : sops.filter(s => s.category === filterCategory)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2e2e2e] flex-shrink-0">
        <h1 className="text-xl font-semibold text-[#e8e8e8]">SOP Library</h1>
        <Button onClick={() => setShowAdd(true)}><Plus size={16} /> Add SOP</Button>
      </div>

      {/* Category filter */}
      <div className="flex gap-1 px-6 py-3 border-b border-[#2e2e2e] overflow-x-auto flex-shrink-0">
        <button
          onClick={() => setFilterCategory('all')}
          className={`px-3 py-1.5 rounded-card text-xs font-medium transition-colors whitespace-nowrap ${filterCategory === 'all' ? 'bg-[#202020] border border-[#2e2e2e] text-[#e8e8e8]' : 'text-[#888] hover:text-[#e8e8e8]'}`}
        >
          All ({sops.length})
        </button>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-3 py-1.5 rounded-card text-xs font-medium transition-colors whitespace-nowrap ${filterCategory === cat ? 'bg-[#202020] border border-[#2e2e2e] text-[#e8e8e8]' : 'text-[#888] hover:text-[#e8e8e8]'}`}
          >
            {cat} ({grouped[cat].length})
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <FileText size={40} className="mx-auto mb-3 text-[#555]" />
            <p className="text-[#888] text-sm">No SOPs yet. Add your first one.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(sop => {
              const color = CATEGORY_COLORS[sop.category]
              return (
                <div key={sop.id} className="bg-[#202020] border border-[#2e2e2e] rounded-card p-5 flex flex-col group">
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="w-10 h-10 rounded-card flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${color}20` }}
                    >
                      <FileText size={18} style={{ color }} />
                    </div>
                    <button
                      onClick={() => deleteSOP(sop.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-card text-[#888] hover:text-[#ef4444] hover:bg-[#252525] transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div className="flex-1">
                    <Badge
                      className="mb-2"
                      color={color}
                      label={sop.category}
                    />
                    <h3 className="text-sm font-semibold text-[#e8e8e8] mb-1">{sop.title}</h3>
                    {sop.description && (
                      <p className="text-xs text-[#888] leading-relaxed line-clamp-3">{sop.description}</p>
                    )}
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    {sop.pdf_url ? (
                      <>
                        <Button size="sm" onClick={() => setPreviewUrl(sop.pdf_url)}>
                          <FileText size={12} /> View PDF
                        </Button>
                        <a href={sop.pdf_url} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="ghost">
                            <ExternalLink size={12} /> Open
                          </Button>
                        </a>
                      </>
                    ) : (
                      <span className="text-xs text-[#555]">No PDF attached</span>
                    )}
                  </div>

                  <p className="text-[10px] text-[#555] mt-2">
                    Added {new Date(sop.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* PDF Preview Modal */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="w-full max-w-4xl h-full max-h-[90vh] bg-[#202020] rounded-card overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[#2e2e2e]">
              <p className="text-sm font-medium text-[#e8e8e8]">PDF Preview</p>
              <div className="flex items-center gap-2">
                <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="ghost"><ExternalLink size={12} /> Open in new tab</Button>
                </a>
                <Button size="sm" variant="ghost" onClick={() => setPreviewUrl(null)}>Close</Button>
              </div>
            </div>
            <iframe src={previewUrl} className="flex-1 w-full" title="SOP PDF" />
          </div>
        </div>
      )}

      {/* Add SOP Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add SOP" width="lg">
        <div className="space-y-3">
          <Input
            label="Title *"
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="e.g. Walk-around filming guide"
          />
          <Select
            label="Category *"
            value={form.category}
            onChange={e => setForm(p => ({ ...p, category: e.target.value as Category }))}
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Textarea
            label="Description"
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            rows={3}
            placeholder="What does this SOP cover?"
          />

          {/* PDF Upload */}
          <div>
            <p className="text-xs font-medium text-[#888] mb-1.5">PDF Document</p>
            {form.pdf_url ? (
              <div className="flex items-center gap-2 p-2 bg-[#191919] border border-[#10b981]/30 rounded-card">
                <FileText size={14} className="text-[#10b981]" />
                <span className="text-xs text-[#10b981] flex-1 truncate">PDF uploaded</span>
                <button onClick={() => setForm(p => ({ ...p, pdf_url: '' }))} className="text-xs text-[#888] hover:text-[#ef4444]">Remove</button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 p-4 border border-dashed border-[#2e2e2e] rounded-card cursor-pointer hover:border-[#4f8ef7]/50 transition-colors">
                {uploading ? (
                  <span className="text-xs text-[#888]">Uploading…</span>
                ) : (
                  <>
                    <Upload size={16} className="text-[#888]" />
                    <span className="text-xs text-[#888]">Click to upload PDF</span>
                  </>
                )}
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && uploadPDF(e.target.files[0])}
                />
              </label>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={addSOP} disabled={saving || uploading || !form.title.trim()}>
              {saving ? 'Saving…' : 'Add SOP'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
