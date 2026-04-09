export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Parse PDF text into logical script sections
// Groups by numbered items, headings, or paragraphs — NOT individual lines
function parseScriptSections(rawText: string): string[] {
  const text = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  const sections: string[] = []

  // Strategy 1: numbered items like "1." "2." "3." or "1)" "2)"
  const numberedPattern = /(?:^|\n)\s*(\d+[\.\)])\s+/g
  const numberedMatches = [...text.matchAll(numberedPattern)]

  if (numberedMatches.length >= 2) {
    for (let i = 0; i < numberedMatches.length; i++) {
      const start = numberedMatches[i].index! + numberedMatches[i][0].length
      const end = i + 1 < numberedMatches.length ? numberedMatches[i + 1].index! : text.length
      const content = text.slice(start, end).trim()
      if (content.length > 3) sections.push(content.replace(/\n+/g, ' ').trim())
    }
    if (sections.length >= 2) return sections
  }

  // Strategy 2: ALL CAPS headings or lines ending with a colon as section headers
  const headingPattern = /\n([A-Z][A-Z\s]{4,}:|SCENE\s+\d+|INT\.|EXT\.|LOCATION:|SHOT\s+\d+)/g
  const headingMatches = [...text.matchAll(headingPattern)]

  if (headingMatches.length >= 2) {
    for (let i = 0; i < headingMatches.length; i++) {
      const start = headingMatches[i].index!
      const end = i + 1 < headingMatches.length ? headingMatches[i + 1].index! : text.length
      const content = text.slice(start, end).trim()
      if (content.length > 5) sections.push(content.replace(/\n+/g, ' ').trim())
    }
    if (sections.length >= 2) return sections
  }

  // Strategy 3: double-newline paragraphs (most common for scripts)
  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(p => p.length > 15 && p.length < 2000) // skip tiny lines and giant blocks

  if (paragraphs.length >= 2) return paragraphs

  // Strategy 4: fallback — split on single newlines, merge short lines into groups of 3
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5)
  const grouped: string[] = []
  for (let i = 0; i < lines.length; i += 3) {
    grouped.push(lines.slice(i, i + 3).join(' — '))
  }
  return grouped
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const shootId = formData.get('shoot_id') as string | null

    if (!file || !shootId) {
      return NextResponse.json({ error: 'file and shoot_id required' }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
    }

    // 1. Upload PDF to Supabase Storage
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const fileName = `${shootId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

    const { error: uploadError } = await supabase.storage
      .from('shoot-pdfs')
      .upload(fileName, buffer, { contentType: 'application/pdf', upsert: true })

    if (uploadError) {
      return NextResponse.json({ error: `Storage error: ${uploadError.message}` }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage.from('shoot-pdfs').getPublicUrl(fileName)

    // 2. Parse PDF text
    let sections: string[] = []
    try {
      // Dynamic import to avoid SSR issues
      const pdfParse = (await import('pdf-parse')).default
      const parsed = await pdfParse(buffer)
      sections = parseScriptSections(parsed.text)
    } catch (parseErr) {
      console.warn('PDF parse error:', parseErr)
      // Still save the PDF even if we can't parse it
    }

    // 3. Save PDF url on the shoot record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('shoots') as any).update({ pdf_url: publicUrl, pdf_name: file.name }).eq('id', shootId)

    // 4. Delete old scripts for this shoot, insert new ones
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('shoot_scripts') as any).delete().eq('shoot_id', shootId)

    if (sections.length > 0) {
      const rows = sections.map((content, i) => ({
        shoot_id: shootId,
        content,
        order_num: i,
        done: false,
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('shoot_scripts') as any).insert(rows)
    }

    return NextResponse.json({
      success: true,
      pdf_url: publicUrl,
      pdf_name: file.name,
      sections_found: sections.length,
      sections: sections.slice(0, 3), // preview first 3
    })
  } catch (e) {
    console.error('Upload error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
