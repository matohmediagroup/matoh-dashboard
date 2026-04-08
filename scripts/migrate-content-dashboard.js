/**
 * Migrates all video titles from Notion Content Dashboard CSV → content_items
 * Skips rows matching "new content" pattern (those belong to post_schedule)
 * Run: node scripts/migrate-content-dashboard.js
 */

const fs = require('fs')
const https = require('https')
const path = require('path')

const env = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8')
const vars = {}
env.split('\n').forEach(l => { const [k,...v]=l.split('='); if(k&&v.length) vars[k.trim()]=v.join('=').trim() })

const SUPABASE_URL = vars['NEXT_PUBLIC_SUPABASE_URL']
const SERVICE_KEY  = vars['SUPABASE_SERVICE_ROLE_KEY']
const base = new URL(SUPABASE_URL)

function req(method, table, body, qs) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null
    const options = {
      hostname: base.hostname,
      path: `/rest/v1/${table}${qs ? '?' + qs : ''}`,
      method,
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      }
    }
    if (postData) options.headers['Content-Length'] = Buffer.byteLength(postData)
    const r = https.request(options, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: d ? JSON.parse(d) : null }) }
        catch { resolve({ status: res.statusCode, body: d }) }
      })
    })
    r.on('error', reject)
    if (postData) r.write(postData)
    r.end()
  })
}

function parseCSVLine(line) {
  const result = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { if (inQ && line[i+1]==='"') { cur+='"'; i++ } else inQ=!inQ }
    else if (ch === ',' && !inQ) { result.push(cur); cur='' }
    else cur += ch
  }
  result.push(cur)
  return result
}

function parseDate(str) {
  if (!str || !str.trim()) return null
  const d = new Date(str.trim())
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

function normalizeName(raw) {
  if (!raw) return null
  // Remove Notion URL in parens: "Toyota Santa Monica (https://...)"
  const cleaned = raw.replace(/\s*\(https?:\/\/[^)]+\)/g, '').trim()
  const MAP = {
    'Audi Pacific':          'Audi Pacific',
    'VW Pacific':            'Volkswagen Pacific',
    'Volkswagen Pacific':    'Volkswagen Pacific',
    'Hyundai Santa Monica':  'Hyundai Santa Monica',
    'Toyota Santa Monica':   'Toyota Santa Monica',
    'Kia Santa Monica':      'Kia Santa Monica',
    'Subaru Pacific':        'Subaru Pacific',
    'Phillips Auto':         'Phillips Auto',
    'CDF Funzone':           'CDFZ',
    'CDFZone':               'CDFZ',
    'CDFZ':                  'CDFZ',
    'Legends':               'Legends Apparel',
    'Legends Apparel':       'Legends Apparel',
  }
  return MAP[cleaned] || cleaned || null
}

function mapStatus(raw) {
  const s = (raw || '').toLowerCase()
  if (s.includes('done') || s.includes('complete')) return 'done'
  if (s.includes('progress')) return 'in_progress'
  if (s.includes('revision')) return 'revisions'
  if (s.includes('review')) return 'revisions'
  return 'unassigned'
}

async function main() {
  console.log('📹 Migrating Content Dashboard → content_items\n')

  // Load clients
  const { body: clients } = await req('GET', 'clients', null, 'select=id,name')
  const clientMap = {}
  ;(clients || []).forEach(c => { clientMap[c.name] = c.id })
  console.log('Clients:', Object.keys(clientMap).join(', '), '\n')

  // Load editors (profiles with role editor/manager/owner)
  const { body: profiles } = await req('GET', 'profiles', null, 'select=id,full_name,role')
  const editorMap = {}
  ;(profiles || []).forEach(p => { if (p.full_name) editorMap[p.full_name.toLowerCase()] = p.id })
  console.log('Editors:', Object.keys(editorMap).join(', '), '\n')

  // Clear existing content_items first
  await req('DELETE', 'content_items', null, 'id=neq.00000000-0000-0000-0000-000000000000')
  console.log('✓ Cleared existing content_items\n')

  // Read CSV
  const csvPath = "/Users/rayaanjaffer/Downloads/Notion files/Private & Shared 2/Content Dashboard 31617dc4a66080a4a096ec6db710fa6c_all.csv"
  const content = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '')
  const lines = content.split('\n').filter(l => l.trim())
  const headers = parseCSVLine(lines[0])
  console.log('Headers:', headers.join(' | '))
  console.log(`Total rows: ${lines.length - 1}\n`)

  let ok = 0, skipped = 0
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i])
    const row = {}
    headers.forEach((h, idx) => { row[h.trim()] = (vals[idx] || '').trim() })

    const title = row['CLIENT'] || ''
    if (!title) { skipped++; continue }

    // Skip posting-slot rows (these belong in post_schedule)
    if (/new content/i.test(title)) { skipped++; continue }

    // Resolve client from "Client (Docs)" column
    const rawClient = row['Client (Docs)'] || ''
    const clientName = normalizeName(rawClient)
    const clientId = clientName ? (clientMap[clientName] || null) : null

    if (!clientId && rawClient) {
      console.log(`  ⚠ Unknown client "${rawClient}" for "${title}"`)
    }

    // Map editor name to profile ID
    const editorName = (row['Editor'] || '').trim().toLowerCase()
    const editorId = editorName ? (editorMap[editorName] || null) : null

    const isPosted = (row['Posted'] || '').toLowerCase() === 'yes'
    const isApproved = (row['Approved'] || '').toLowerCase() === 'yes'
    const editStatus = mapStatus(row['Status'])
    const postDate = parseDate(row['Post Date'])
    const editDate = parseDate(row['Edit Date'])

    const res = await req('POST', 'content_items', {
      title,
      client_id: clientId,
      filming_status: isPosted ? 'filmed' : 'not_filmed',
      approval_status: isApproved ? 'approved' : 'pending',
      edit_status: editStatus,
      assigned_editor_id: editorId,
      posted_date: postDate || editDate || null,
    })

    if (res.status >= 400) {
      console.error(`  ✗ Row ${i}: "${title}"`, res.body)
      skipped++
    } else {
      ok++
      if (ok % 25 === 0) console.log(`  ... ${ok} inserted`)
    }
  }

  console.log(`\n✓ Inserted ${ok} videos into content_items`)
  console.log(`  Skipped: ${skipped} (new-content slots + blanks)`)
  console.log('\n✅ Done! Refresh your dashboard.')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
