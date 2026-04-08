/**
 * Notion → Supabase Migration Script
 * Run: node scripts/migrate-notion.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { parse } from 'csv-parse/sync'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

function readCSV(filePath) {
  const content = readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '') // strip BOM
  return parse(content, { columns: true, skip_empty_lines: true, trim: true })
}

function parseDate(str) {
  if (!str) return null
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

// Client name → color mapping
const CLIENT_COLORS = {
  'Audi Pacific':          '#BB0A21',
  'Volkswagen Pacific':    '#001E50',
  'Hyundai Santa Monica':  '#002C5F',
  'Toyota Santa Monica':   '#EB0A1E',
  'Kia Santa Monica':      '#BB162B',
  'Subaru Pacific':        '#003399',
  'Phillips Auto':         '#F0A500',
  'Legends Apparel':       '#2D2D2D',
  'CDFZ':                  '#FF6B35',
  'CDF Funzone':           '#FF6B35',
  'CDFZone':               '#FF6B35',
}

// Normalize client names from Notion to our standard names
function normalizeClientName(name) {
  if (!name) return null
  const cleaned = name.replace(/\s*\(https?:\/\/[^)]+\)/g, '').trim()
  const map = {
    'Audi Pacific':           'Audi Pacific',
    'VW Pacific':             'Volkswagen Pacific',
    'Volkswagen Pacific':     'Volkswagen Pacific',
    'Hyundai Santa Monica':   'Hyundai Santa Monica',
    'Toyota Santa Monica':    'Toyota Santa Monica',
    'Kia Santa Monica':       'Kia Santa Monica',
    'Subaru Pacific':         'Subaru Pacific',
    'Phillips':               'Phillips Auto',
    'Phillips Auto':          'Phillips Auto',
    'Legends Apparel':        'Legends Apparel',
    'CDF Funzone':            'CDFZ',
    'CDFZone':                'CDFZ',
    'CDFZ':                   'CDFZ',
  }
  return map[cleaned] || cleaned
}

// ─── 1. CLIENTS ──────────────────────────────────────────────────────────────
async function migrateClients() {
  console.log('\n📦 Migrating Clients…')
  const rows = readCSV("/Users/rayaanjaffer/Downloads/Notion files/Private & Shared/Clients Docs 30517dc4a6608066b475c0a72ba85022.csv")

  let inserted = 0
  for (const row of rows) {
    const name = normalizeClientName(row['Client Name'])
    if (!name) continue

    const payload = {
      name,
      status: row['Status']?.toLowerCase() === 'active' ? 'active' : 'inactive',
      color: CLIENT_COLORS[name] || '#6366f1',
      contract_start: parseDate(row['Contract Start Date']),
      contract_end: parseDate(row['Contract End Date']),
      monthly_retainer: 0,
    }

    const { error } = await supabase.from('clients').upsert(payload, { onConflict: 'name' })
    if (error) console.error(`  ✗ ${name}: ${error.message}`)
    else { console.log(`  ✓ ${name}`); inserted++ }
  }
  console.log(`  → ${inserted} clients migrated`)
}

// ─── 2. CONTENT ITEMS (Content Dashboard) ────────────────────────────────────
async function migrateContentDashboard() {
  console.log('\n📦 Migrating Content Dashboard…')
  const rows = readCSV("/Users/rayaanjaffer/Downloads/Notion files/Private & Shared 2/Content Dashboard 31617dc4a66080a4a096ec6db710fa6c_all.csv")

  // Fetch clients to build name→id map
  const { data: clients } = await supabase.from('clients').select('id, name')
  const clientMap = Object.fromEntries((clients || []).map(c => [c.name, c.id]))

  let inserted = 0
  for (const row of rows) {
    const rawClient = row['Client (Docs)'] || row['CLIENT'] || ''
    const clientName = normalizeClientName(rawClient)
    const clientId = clientMap[clientName] || null

    const title = row['CLIENT'] || row['Name'] || 'Untitled'
    if (!title || title.trim() === '') continue

    // Map Notion status → our edit_status
    const notionStatus = (row['Status'] || '').toLowerCase()
    let editStatus = 'unassigned'
    if (notionStatus.includes('progress')) editStatus = 'in_progress'
    else if (notionStatus.includes('revision')) editStatus = 'revisions'
    else if (notionStatus.includes('done') || notionStatus.includes('complete')) editStatus = 'done'

    const posted = row['Posted']?.toLowerCase() === 'yes'
    const filmingStatus = posted ? 'filmed' : 'not_filmed'
    const approved = row['Approved']?.toLowerCase() === 'yes'
    const approvalStatus = approved ? 'approved' : 'pending'

    const payload = {
      title: title.trim(),
      client_id: clientId,
      filming_status: filmingStatus,
      edit_status: editStatus,
      approval_status: approvalStatus,
      posted_date: parseDate(row['Post Date'] || row['Edit Date']),
      caption: row['Notes'] || null,
    }

    const { error } = await supabase.from('content_items').insert(payload)
    if (error) console.error(`  ✗ ${title}: ${error.message}`)
    else inserted++
  }
  console.log(`  → ${inserted} content items migrated`)
}

// ─── 3. CONTENT SCHEDULE ─────────────────────────────────────────────────────
async function migrateContentSchedule() {
  console.log('\n📦 Migrating Content Schedule…')
  const rows = readCSV("/Users/rayaanjaffer/Downloads/Notion files/Private & Shared 4/Content Schedule 31217dc4a6608074bd35f9c6324ab2b8_all.csv")

  const { data: clients } = await supabase.from('clients').select('id, name')
  const clientMap = Object.fromEntries((clients || []).map(c => [c.name, c.id]))

  let inserted = 0
  for (const row of rows) {
    const title = row['Content Title'] || row['Name'] || ''
    if (!title.trim()) continue

    const rawClient = row['Client Tag'] || row['Project Client'] || ''
    const clientName = normalizeClientName(rawClient)
    const clientId = clientMap[clientName] || null

    const status = (row['Task Status'] || '').toLowerCase()
    let editStatus = 'unassigned'
    if (status.includes('progress') || status.includes('doing')) editStatus = 'in_progress'
    else if (status.includes('review') || status.includes('revision')) editStatus = 'revisions'
    else if (status.includes('done') || status.includes('complete')) editStatus = 'done'

    // Skip if already in content_items (check by title)
    const { data: existing } = await supabase.from('content_items').select('id').eq('title', title.trim()).limit(1)
    if (existing && existing.length > 0) continue

    const payload = {
      title: title.trim(),
      client_id: clientId,
      filming_status: 'not_filmed',
      edit_status: editStatus,
      approval_status: 'pending',
      posted_date: parseDate(row['Post Date']),
    }

    const { error } = await supabase.from('content_items').insert(payload)
    if (error) console.error(`  ✗ ${title}: ${error.message}`)
    else inserted++
  }
  console.log(`  → ${inserted} content schedule items migrated`)
}

// ─── 4. CALENDAR EVENTS (Agency D2D Calendar) ────────────────────────────────
async function migrateCalendar() {
  console.log('\n📦 Migrating Calendar Events…')
  const rows = readCSV("/Users/rayaanjaffer/Downloads/Notion files/Private & Shared 3/Agency D2D Calendar 30517dc4a66080478d63ebb453f2ea55_all.csv")

  const { data: clients } = await supabase.from('clients').select('id, name')
  const clientMap = Object.fromEntries((clients || []).map(c => [c.name, c.id]))

  let inserted = 0
  for (const row of rows) {
    const title = row['Meeting Title'] || row['Name'] || ''
    if (!title.trim()) continue

    const rawClient = row['Client'] || ''
    const clientName = normalizeClientName(rawClient)
    const clientId = clientMap[clientName] || null

    const eventDate = parseDate(row['Date'])
    if (!eventDate) continue

    const type = (row['TYPE'] || '').toLowerCase()
    let eventType = 'meeting'
    if (type.includes('shoot')) eventType = 'meeting' // shoots handled separately
    else if (type.includes('call')) eventType = 'call'

    const payload = {
      title: title.trim(),
      event_type: eventType,
      client_id: clientId,
      event_date: eventDate,
      notes: row['Notes'] || null,
    }

    const { error } = await supabase.from('calendar_events').insert(payload)
    if (error) console.error(`  ✗ ${title}: ${error.message}`)
    else inserted++
  }
  console.log(`  → ${inserted} calendar events migrated`)
}

// ─── 5. SHOOTS (Hayden Shoot Schedule) ───────────────────────────────────────
async function migrateShoots() {
  console.log('\n📦 Migrating Shoot Schedule…')
  const rows = readCSV("/Users/rayaanjaffer/Downloads/Notion files/Private & Shared 5/Hayden Shoot Schedule 33417dc4a660800b944effd7355bfd44_all.csv")

  const { data: clients } = await supabase.from('clients').select('id, name')
  const clientMap = Object.fromEntries((clients || []).map(c => [c.name, c.id]))

  let inserted = 0
  for (const row of rows) {
    const name = row['Name'] || ''
    if (!name.trim()) continue

    const shootDate = parseDate(row['Date'])
    if (!shootDate) continue

    // Try to match client from name (e.g. "Subaru Pacific Shoot" → "Subaru Pacific")
    let clientId = null
    for (const [clientName, id] of Object.entries(clientMap)) {
      if (name.toLowerCase().includes(clientName.toLowerCase())) {
        clientId = id
        break
      }
    }

    const payload = {
      client_id: clientId,
      shoot_date: shootDate,
      notes: name.trim(),
    }

    const { error } = await supabase.from('shoots').insert(payload)
    if (error) console.error(`  ✗ ${name}: ${error.message}`)
    else inserted++
  }
  console.log(`  → ${inserted} shoots migrated`)
}

// ─── ALSO MIGRATE SHOOT SCHEDULE FROM D2D CALENDAR ───────────────────────────
async function migrateShootsFromCalendar() {
  console.log('\n📦 Migrating Shoots from D2D Calendar…')
  const rows = readCSV("/Users/rayaanjaffer/Downloads/Notion files/Private & Shared 3/Agency D2D Calendar 30517dc4a66080478d63ebb453f2ea55_all.csv")

  const { data: clients } = await supabase.from('clients').select('id, name')
  const clientMap = Object.fromEntries((clients || []).map(c => [c.name, c.id]))

  let inserted = 0
  for (const row of rows) {
    const type = (row['TYPE'] || '').toLowerCase()
    if (!type.includes('shoot')) continue

    const title = row['Meeting Title'] || ''
    const shootDate = parseDate(row['Date'])
    if (!shootDate || !title) continue

    const rawClient = row['Client'] || ''
    let clientId = null
    const clientName = normalizeClientName(rawClient)
    if (clientName) clientId = clientMap[clientName] || null

    // Also try matching from title
    if (!clientId) {
      for (const [name, id] of Object.entries(clientMap)) {
        if (title.toLowerCase().includes(name.toLowerCase().split(' ')[0])) {
          clientId = id
          break
        }
      }
    }

    const { error } = await supabase.from('shoots').insert({
      client_id: clientId,
      shoot_date: shootDate,
      notes: title.trim(),
    })
    if (error && !error.message.includes('duplicate')) console.error(`  ✗ ${title}: ${error.message}`)
    else if (!error) inserted++
  }
  console.log(`  → ${inserted} shoots from calendar migrated`)
}

// ─── RUN ALL ──────────────────────────────────────────────────────────────────
console.log('🚀 Matoh Media Group — Notion → Supabase Migration')
console.log('================================================')

await migrateClients()
await migrateContentDashboard()
await migrateContentSchedule()
await migrateCalendar()
await migrateShoots()
await migrateShootsFromCalendar()

console.log('\n✅ Migration complete!')
