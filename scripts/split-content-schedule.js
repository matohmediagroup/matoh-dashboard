/**
 * Splits content_items into:
 * - post_schedule: rows matching "[Client] New Content" pattern
 * - content_items: keeps real video titles only
 *
 * Run: node scripts/split-content-schedule.js
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

async function main() {
  console.log('🔄 Splitting Content Board and Post Schedule...\n')

  // 1. Fetch all content items
  const { body: items } = await req('GET', 'content_items', null, 'select=*')
  if (!Array.isArray(items)) { console.error('Failed to fetch content_items:', items); process.exit(1) }
  console.log(`Found ${items.length} total content items`)

  // 2. Separate them
  // Pattern: ends with "new content" (case insensitive), possibly "New Content for X" etc.
  const scheduleItems = items.filter(i => /new content/i.test(i.title))
  const boardItems = items.filter(i => !/new content/i.test(i.title))

  console.log(`  → ${scheduleItems.length} schedule items (will move to post_schedule)`)
  console.log(`  → ${boardItems.length} real videos (will stay in content_items)\n`)

  // 3. Print what we're moving so user can confirm
  console.log('Schedule items to move:')
  scheduleItems.forEach(i => console.log(`  - "${i.title}" (${i.post_date || 'no date'})`))
  console.log('')

  // 4. Insert into post_schedule
  let moved = 0
  for (const item of scheduleItems) {
    const res = await req('POST', 'post_schedule', {
      client_id: item.client_id,
      post_date: item.posted_date || new Date().toISOString().split('T')[0],
      label: item.title,
      status: 'scheduled',
    })
    if (res.status >= 400) {
      console.error(`  ✗ Failed to insert "${item.title}":`, res.body)
    } else {
      moved++
    }
  }
  console.log(`✓ Moved ${moved} items to post_schedule`)

  // 5. Delete them from content_items
  let deleted = 0
  for (const item of scheduleItems) {
    const res = await req('DELETE', 'content_items', null, `id=eq.${item.id}`)
    if (res.status >= 300) {
      console.error(`  ✗ Failed to delete "${item.title}":`, res.body)
    } else {
      deleted++
    }
  }
  console.log(`✓ Deleted ${deleted} items from content_items`)
  console.log(`\n✅ Done! Content Board now has ${boardItems.length} real videos. Post Schedule has ${moved} slots.`)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
