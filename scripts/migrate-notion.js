/**
 * Notion → Supabase Migration Script (CommonJS, no deps)
 * Run: node scripts/migrate-notion.js
 */

const fs = require('fs')
const https = require('https')
const path = require('path')

// Load env
const envPath = path.join(__dirname, '../.env.local')
const env = fs.readFileSync(envPath, 'utf-8')
const envVars = {}
env.split('\n').forEach(line => {
  const [k, ...v] = line.split('=')
  if (k && v.length) envVars[k.trim()] = v.join('=').trim()
})

const SUPABASE_URL = envVars['NEXT_PUBLIC_SUPABASE_URL']
const SUPABASE_KEY = envVars['SUPABASE_SERVICE_ROLE_KEY'] // bypasses RLS

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE env vars in .env.local')
  process.exit(1)
}

console.log('Using service role key — RLS bypassed ✓')

// ─── HTTP helper ─────────────────────────────────────────────────────────────
function supabaseRequest(method, table, body, params) {
  return new Promise((resolve, reject) => {
    let urlPath = `/rest/v1/${table}`
    if (params) urlPath += '?' + params
    const url = new URL(SUPABASE_URL)
    const postData = body ? JSON.stringify(body) : null
    const options = {
      hostname: url.hostname,
      path: urlPath,
      method: method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal',
      }
    }
    if (postData) options.headers['Content-Length'] = Buffer.byteLength(postData)

    const req = https.request(options, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }) }
        catch { resolve({ status: res.statusCode, body: data }) }
      })
    })
    req.on('error', reject)
    if (postData) req.write(postData)
    req.end()
  })
}

async function dbInsert(table, row) {
  return supabaseRequest('POST', table, row)
}

async function dbSelect(table, params) {
  return supabaseRequest('GET', table, null, params)
}

async function dbUpsert(table, row, onConflict) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL)
    const postData = JSON.stringify(row)
    const options = {
      hostname: url.hostname,
      path: `/rest/v1/${table}`,
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      }
    }
    const req = https.request(options, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.write(postData)
    req.end()
  })
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '')
  const lines = content.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  // Parse header
  const headers = parseCSVLine(lines[0])

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i])
    if (vals.every(v => !v.trim())) continue
    const row = {}
    headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim() })
    rows.push(row)
  }
  return rows
}

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

function parseDate(str) {
  if (!str || !str.trim()) return null
  const d = new Date(str)
  if (isNaN(d.getTime())) return null
  return d.toISOString().split('T')[0]
}

// ─── Client name normalization ────────────────────────────────────────────────
const CLIENT_COLORS = {
  'Audi Pacific':          '#BB0A21',
  'Volkswagen Pacific':    '#001E50',
  'Hyundai Santa Monica':  '#002C5F',
  'Toyota Santa Monica':   '#EB0A1E',
  'Kia Santa Monica':      '#BB162B',
  'Subaru Pacific':        '#003399',
  'Phillips Auto':         '#F0A500',
  'CDFZ':                  '#FF6B35',
}

const CLIENT_NAME_MAP = {
  'Audi Pacific':          'Audi Pacific',
  'VW Pacific':            'Volkswagen Pacific',
  'Volkswagen Pacific':    'Volkswagen Pacific',
  'Hyundai Santa Monica':  'Hyundai Santa Monica',
  'Toyota Santa Monica':   'Toyota Santa Monica',
  'Kia Santa Monica':      'Kia Santa Monica',
  'Subaru Pacific':        'Subaru Pacific',
  'Phillips':              'Phillips Auto',
  'Phillips Auto':         'Phillips Auto',
  'CDF Funzone':           'CDFZ',
  'CDFZone':               'CDFZ',
  'CDFZ':                  'CDFZ',
}

function normalizeName(raw) {
  if (!raw) return null
  // Strip notion URLs like "(https://www.notion.so/...)"
  const cleaned = raw.replace(/\s*\(https?:\/\/[^)]+\)/g, '').trim()
  return CLIENT_NAME_MAP[cleaned] || cleaned
}

// ─── 1. CLIENTS ───────────────────────────────────────────────────────────────
async function migrateClients() {
  console.log('\n📦 Migrating Clients...')
  const rows = parseCSV("/Users/rayaanjaffer/Downloads/Notion files/Private & Shared/Clients Docs 30517dc4a6608066b475c0a72ba85022.csv")
  let ok = 0
  for (const row of rows) {
    const name = normalizeName(row['Client Name'])
    if (!name) continue
    const payload = {
      name,
      status: (row['Status'] || '').toLowerCase() === 'active' ? 'active' : 'inactive',
      color: CLIENT_COLORS[name] || '#6366f1',
      contract_start: parseDate(row['Contract Start Date']),
      contract_end: parseDate(row['Contract End Date']),
      monthly_retainer: 0,
    }
    const res = await dbUpsert('clients', payload, 'name')
    if (res.status >= 400) console.error('  ✗', name, res.body)
    else { console.log('  ✓', name); ok++ }
  }
  console.log('  →', ok, 'clients')
}

// ─── 2. CONTENT DASHBOARD ────────────────────────────────────────────────────
async function migrateContentDashboard(clientMap) {
  console.log('\n📦 Migrating Content Dashboard...')
  const rows = parseCSV("/Users/rayaanjaffer/Downloads/Notion files/Private & Shared 2/Content Dashboard 31617dc4a66080a4a096ec6db710fa6c_all.csv")
  let ok = 0
  for (const row of rows) {
    const title = (row['CLIENT'] || row['Name'] || '').trim()
    if (!title) continue

    const rawClient = row['Client (Docs)'] || row['CLIENT'] || ''
    const clientName = normalizeName(rawClient)
    const clientId = clientMap[clientName] || null

    const status = (row['Status'] || '').toLowerCase()
    let editStatus = 'unassigned'
    if (status.includes('progress')) editStatus = 'in_progress'
    else if (status.includes('revision')) editStatus = 'revisions'
    else if (status.includes('done') || status.includes('complete')) editStatus = 'done'

    const posted = (row['Posted'] || '').toLowerCase() === 'yes'
    const approved = (row['Approved'] || '').toLowerCase() === 'yes'

    const payload = {
      title,
      client_id: clientId,
      filming_status: posted ? 'filmed' : 'not_filmed',
      edit_status: editStatus,
      approval_status: approved ? 'approved' : 'pending',
      posted_date: parseDate(row['Post Date'] || row['Edit Date']) ,
      caption: row['Notes'] || null,
    }
    const res = await dbInsert('content_items', payload)
    if (res.status >= 400) console.error('  ✗', title.slice(0,40), res.body)
    else ok++
  }
  console.log('  →', ok, 'content items')
}

// ─── 3. CONTENT SCHEDULE ─────────────────────────────────────────────────────
async function migrateContentSchedule(clientMap) {
  console.log('\n📦 Migrating Content Schedule...')
  const rows = parseCSV("/Users/rayaanjaffer/Downloads/Notion files/Private & Shared 4/Content Schedule 31217dc4a6608074bd35f9c6324ab2b8_all.csv")
  let ok = 0
  for (const row of rows) {
    const title = (row['Content Title'] || row['Name'] || '').trim()
    if (!title) continue

    const rawClient = row['Client Tag'] || row['Project Client'] || ''
    const clientName = normalizeName(rawClient)
    const clientId = clientMap[clientName] || null

    const status = (row['Task Status'] || '').toLowerCase()
    let editStatus = 'unassigned'
    if (status.includes('progress') || status.includes('doing')) editStatus = 'in_progress'
    else if (status.includes('review') || status.includes('revision')) editStatus = 'revisions'
    else if (status.includes('done') || status.includes('complete')) editStatus = 'done'

    const payload = {
      title,
      client_id: clientId,
      filming_status: 'not_filmed',
      edit_status: editStatus,
      approval_status: 'pending',
      posted_date: parseDate(row['Post Date']),
    }
    const res = await dbInsert('content_items', payload)
    if (res.status >= 400) console.error('  ✗', title.slice(0,40), res.body)
    else ok++
  }
  console.log('  →', ok, 'schedule items')
}

// ─── 4. CALENDAR ─────────────────────────────────────────────────────────────
async function migrateCalendar(clientMap) {
  console.log('\n📦 Migrating Calendar Events...')
  const rows = parseCSV("/Users/rayaanjaffer/Downloads/Notion files/Private & Shared 3/Agency D2D Calendar 30517dc4a66080478d63ebb453f2ea55_all.csv")
  let ok = 0
  for (const row of rows) {
    const title = (row['Meeting Title'] || row['Name'] || '').trim()
    const eventDate = parseDate(row['Date'])
    if (!title || !eventDate) continue

    const type = (row['TYPE'] || '').toLowerCase()
    if (type.includes('shoot')) continue // handled in shoots

    const clientName = normalizeName(row['Client'] || '')
    const clientId = clientMap[clientName] || null

    const payload = {
      title,
      event_type: type.includes('call') ? 'call' : 'meeting',
      client_id: clientId,
      event_date: eventDate,
      notes: row['Notes'] || null,
    }
    const res = await dbInsert('calendar_events', payload)
    if (res.status >= 400) console.error('  ✗', title, res.body)
    else ok++
  }
  console.log('  →', ok, 'calendar events')
}

// ─── 5. SHOOTS ───────────────────────────────────────────────────────────────
async function migrateShoots(clientMap) {
  console.log('\n📦 Migrating Shoots...')
  let ok = 0

  // From Hayden shoot schedule
  const rows1 = parseCSV("/Users/rayaanjaffer/Downloads/Notion files/Private & Shared 5/Hayden Shoot Schedule 33417dc4a660800b944effd7355bfd44_all.csv")
  for (const row of rows1) {
    const name = (row['Name'] || '').trim()
    const shootDate = parseDate(row['Date'])
    if (!name || !shootDate) continue

    let clientId = null
    for (const [clientName, id] of Object.entries(clientMap)) {
      if (name.toLowerCase().includes(clientName.toLowerCase().split(' ')[0])) {
        clientId = id; break
      }
    }
    const res = await dbInsert('shoots', { client_id: clientId, shoot_date: shootDate, notes: name })
    if (res.status >= 400) console.error('  ✗', name, res.body)
    else ok++
  }

  // From D2D calendar (shoot type rows)
  const rows2 = parseCSV("/Users/rayaanjaffer/Downloads/Notion files/Private & Shared 3/Agency D2D Calendar 30517dc4a66080478d63ebb453f2ea55_all.csv")
  for (const row of rows2) {
    const type = (row['TYPE'] || '').toLowerCase()
    if (!type.includes('shoot')) continue
    const title = (row['Meeting Title'] || '').trim()
    const shootDate = parseDate(row['Date'])
    if (!title || !shootDate) continue

    const clientName = normalizeName(row['Client'] || '')
    let clientId = clientMap[clientName] || null
    if (!clientId) {
      for (const [cn, id] of Object.entries(clientMap)) {
        if (title.toLowerCase().includes(cn.toLowerCase().split(' ')[0])) { clientId = id; break }
      }
    }
    const res = await dbInsert('shoots', { client_id: clientId, shoot_date: shootDate, notes: title })
    if (res.status >= 400) console.error('  ✗', title, res.body)
    else ok++
  }
  console.log('  →', ok, 'shoots')
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Matoh Media Group — Notion → Supabase Migration')
  console.log('==================================================')

  await migrateClients()

  // Fetch client map for subsequent steps
  const { body: clients } = await dbSelect('clients', 'select=id,name')
  const clientMap = {}
  ;(clients || []).forEach(c => { clientMap[c.name] = c.id })
  console.log('\n  Client map loaded:', Object.keys(clientMap).join(', '))

  await migrateContentDashboard(clientMap)
  await migrateContentSchedule(clientMap)
  await migrateCalendar(clientMap)
  await migrateShoots(clientMap)

  console.log('\n✅ Migration complete! Refresh your dashboard.')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
