/**
 * Fix duplicate clients + insert shoots from Notion
 * Run: node scripts/fix-duplicates-and-shoots.js
 */

const fs = require('fs')
const https = require('https')
const path = require('path')

const env = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8')
const vars = {}
env.split('\n').forEach(l => { const [k,...v]=l.split('='); if(k&&v.length) vars[k.trim()]=v.join('=').trim() })

const SUPABASE_URL = vars['NEXT_PUBLIC_SUPABASE_URL']
const SERVICE_KEY  = vars['SUPABASE_SERVICE_ROLE_KEY']
const url = new URL(SUPABASE_URL)

function req(method, table, body, qs) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null
    const options = {
      hostname: url.hostname,
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

// ─── 1. FIX DUPLICATE CLIENTS ────────────────────────────────────────────────
async function fixDuplicateClients() {
  console.log('\n🧹 Fixing duplicate clients...')

  // Get all clients
  const { body: clients } = await req('GET', 'clients', null, 'select=id,name,created_at&order=created_at.asc')
  if (!clients || !Array.isArray(clients)) { console.error('Could not fetch clients'); return {} }

  // Group by name
  const groups = {}
  clients.forEach(c => {
    if (!groups[c.name]) groups[c.name] = []
    groups[c.name].push(c)
  })

  // Delete Legends Apparel entirely
  for (const c of clients.filter(c => c.name.toLowerCase().includes('legends'))) {
    const res = await req('DELETE', 'clients', null, `id=eq.${c.id}`)
    if (res.status < 300) console.log(`  ✓ Deleted Legends Apparel (${c.id})`)
  }

  // Delete duplicates (keep first/oldest)
  let deleted = 0
  for (const [name, rows] of Object.entries(groups)) {
    if (name.toLowerCase().includes('legends')) continue // already deleted
    if (rows.length <= 1) continue
    const toDelete = rows.slice(1) // keep first, delete rest
    for (const dup of toDelete) {
      const res = await req('DELETE', 'clients', null, `id=eq.${dup.id}`)
      if (res.status < 300) { console.log(`  ✓ Removed duplicate: ${name} (${dup.id})`); deleted++ }
      else console.error(`  ✗ Failed to delete ${name}:`, res.body)
    }
  }
  console.log(`  → ${deleted} duplicates removed`)

  // Return clean client map
  const { body: clean } = await req('GET', 'clients', null, 'select=id,name')
  const map = {}
  ;(clean || []).forEach(c => { map[c.name] = c.id })
  return map
}

// ─── 2. CLEAR OLD SHOOTS + INSERT FROM SCREENSHOT ────────────────────────────
async function insertShoots(clientMap) {
  console.log('\n📦 Inserting shoots from Notion...')

  // Clear existing shoots first to avoid dupes
  await req('DELETE', 'shoots', null, 'id=neq.00000000-0000-0000-0000-000000000000')
  console.log('  ✓ Cleared old shoots')

  const shoots = [
    { name: 'Subaru Pacific Shoot',         client: 'Subaru Pacific',        date: '2026-04-03', time: '09:45' },
    { name: 'Toyota Santa Monica Shoot',    client: 'Toyota Santa Monica',   date: '2026-04-05', time: '10:15' },
    { name: 'Volkswagen Pacific Shoot',     client: 'Volkswagen Pacific',    date: '2026-04-06', time: '09:45' },
    { name: 'Toyota of Hollywood Shoot',    client: 'Toyota Santa Monica',   date: '2026-04-10', time: '10:30' },
    { name: 'Kia Santa Monica Shoot',       client: 'Kia Santa Monica',      date: '2026-04-12', time: '10:15' },
    { name: 'Audi Pacific Shoot',           client: 'Audi Pacific',          date: '2026-04-16', time: '09:45' },
    { name: 'Hyundai Santa Monica Shoot',   client: 'Hyundai Santa Monica',  date: '2026-04-18', time: '10:15' },
    { name: 'Toyota Santa Monica Shoot',    client: 'Toyota Santa Monica',   date: '2026-04-19', time: '10:15' },
    { name: 'Subaru Pacific Shoot',         client: 'Subaru Pacific',        date: '2026-04-22', time: '09:45' },
    { name: 'Volkswagen Pacific Shoot',     client: 'Volkswagen Pacific',    date: '2026-04-28', time: '09:45' },
    { name: 'Kia Santa Monica Shoot',       client: 'Kia Santa Monica',      date: '2026-04-30', time: '10:15' },
  ]

  let ok = 0
  for (const s of shoots) {
    const clientId = clientMap[s.client] || null
    const res = await req('POST', 'shoots', {
      client_id: clientId,
      shoot_date: s.date,
      shoot_time: s.time,
      notes: s.name,
    })
    if (res.status >= 400) console.error(`  ✗ ${s.name}:`, res.body)
    else { console.log(`  ✓ ${s.name} — ${s.date} ${s.time}`); ok++ }
  }
  console.log(`  → ${ok}/11 shoots inserted`)
}

async function main() {
  console.log('🔧 Matoh — Fix Duplicates + Insert Shoots')
  console.log('==========================================')
  const clientMap = await fixDuplicateClients()
  console.log('\n  Clients:', Object.keys(clientMap).join(', '))
  await insertShoots(clientMap)
  console.log('\n✅ Done! Refresh your dashboard.')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
