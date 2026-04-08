/**
 * Migrates all 412 posting slots directly from Notion CSV → post_schedule
 * Also cleans "new content" items out of content_items
 * Run: node scripts/migrate-schedule-direct.js
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

const CLIENT_NAME_MAP = {
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
}

function normalizeName(raw) {
  if (!raw) return null
  const cleaned = raw.replace(/\s*\(https?:\/\/[^)]+\)/g, '').trim()
  return CLIENT_NAME_MAP[cleaned] || cleaned
}

async function main() {
  console.log('📅 Migrating Content Schedule → post_schedule\n')

  // Load client map
  const { body: clients } = await req('GET', 'clients', null, 'select=id,name')
  const clientMap = {}
  ;(clients || []).forEach(c => { clientMap[c.name] = c.id })
  console.log('Clients loaded:', Object.keys(clientMap).join(', '), '\n')

  // Read CSV
  const csvPath = "/Users/rayaanjaffer/Downloads/Notion files/Private & Shared 4/Content Schedule 31217dc4a6608074bd35f9c6324ab2b8_all.csv"
  const content = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '')
  const lines = content.split('\n').filter(l => l.trim())
  const headers = parseCSVLine(lines[0])
  console.log('Headers:', headers.join(' | '))
  console.log(`Total rows: ${lines.length - 1}\n`)

  // Clear existing post_schedule first
  await req('DELETE', 'post_schedule', null, 'id=neq.00000000-0000-0000-0000-000000000000')
  console.log('✓ Cleared existing post_schedule entries\n')

  // Insert all rows
  let ok = 0, skipped = 0
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i])
    const row = {}
    headers.forEach((h, idx) => { row[h.trim()] = (vals[idx] || '').trim() })

    const title = row['Content Title'] || ''
    const rawClient = row['Client Tag'] || row['Project Client'] || ''
    const clientName = normalizeName(rawClient)
    const clientId = clientMap[clientName] || null
    const postDate = parseDate(row['Post Date'])
    const status = (row['Task Status'] || '').toLowerCase()

    if (!title || !postDate) { skipped++; continue }
    if (!clientId) {
      // try to infer from title: "Audi New Content" → Audi Pacific
      // skip for now, log
      console.log(`  ⚠ No client for "${title}" (tag="${rawClient}")`)
      skipped++
      continue
    }

    let slotStatus = 'scheduled'
    if (status.includes('posted') || status.includes('done') || status.includes('complete')) slotStatus = 'posted'
    else if (status.includes('missed')) slotStatus = 'missed'

    const res = await req('POST', 'post_schedule', {
      client_id: clientId,
      post_date: postDate,
      label: title,
      status: slotStatus,
    })
    if (res.status >= 400) {
      console.error(`  ✗ Row ${i}: "${title}" ${postDate}`, res.body)
      skipped++
    } else {
      ok++
      if (ok % 50 === 0) console.log(`  ... ${ok} inserted`)
    }
  }

  console.log(`\n✓ Inserted ${ok} slots into post_schedule`)
  console.log(`  Skipped: ${skipped}`)

  // Clean "new content" items out of content_items
  console.log('\n🧹 Cleaning "New Content" items from Content Board...')
  const { body: items } = await req('GET', 'content_items', null, 'select=id,title')
  const toDelete = (items || []).filter(i => /new content/i.test(i.title))
  let deleted = 0
  for (const item of toDelete) {
    const res = await req('DELETE', 'content_items', null, `id=eq.${item.id}`)
    if (res.status < 300) deleted++
  }
  console.log(`✓ Removed ${deleted} "New Content" items from Content Board`)
  console.log('\n✅ Done! Refresh your dashboard.')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
