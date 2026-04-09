export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const IG_USER = process.env.INSTAGRAM_USERNAME!
const IG_PASS  = process.env.INSTAGRAM_PASSWORD!

export async function GET() {
  const results: Record<string, any> = {}

  // ── TikTok test ───────────────────────────────────────────────
  try {
    const res = await fetch('https://www.tiktok.com/@carscouted', {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    const html = await res.text()
    const hasUniversal = html.includes('__UNIVERSAL_DATA_FOR_REHYDRATION__')
    const hasSigi      = html.includes('SIGI_STATE')
    const hasItemList  = html.includes('itemList')
    const snippet      = html.slice(0, 500)

    results.tiktok = {
      status: res.status,
      hasUniversal,
      hasSigi,
      hasItemList,
      htmlLength: html.length,
      snippet,
    }

    // Try to parse if data exists
    if (hasUniversal) {
      const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)
      if (match) {
        try {
          const data = JSON.parse(match[1])
          const scope = data['__DEFAULT_SCOPE__'] || {}
          results.tiktok.scopeKeys = Object.keys(scope)
          const itemList =
            scope['webapp.video-list']?.itemList ||
            scope['webapp.userPost']?.statusList ||
            scope['webapp.user-post']?.itemList || []
          results.tiktok.itemCount = itemList.length
          results.tiktok.firstItem = itemList[0] ? { desc: itemList[0].desc, stats: itemList[0].stats } : null
        } catch (e) {
          results.tiktok.parseError = String(e)
        }
      }
    }
  } catch (e) {
    results.tiktok = { error: String(e) }
  }

  // ── Instagram login test ───────────────────────────────────────
  try {
    results.instagram = { username: IG_USER, hasPassword: !!IG_PASS }

    // Step 1: get CSRF
    const initRes = await fetch('https://www.instagram.com/', {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    })
    const initCookies = initRes.headers.get('set-cookie') || ''
    const csrfMatch = initCookies.match(/csrftoken=([^;,\s]+)/)
    const csrf = csrfMatch?.[1]
    results.instagram.step1 = { status: initRes.status, gotCsrf: !!csrf }

    if (csrf) {
      // Step 2: login
      const encPassword = `#PWD_INSTAGRAM_BROWSER:0:${Math.floor(Date.now() / 1000)}:${IG_PASS}`
      const loginRes = await fetch('https://www.instagram.com/accounts/login/ajax/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': UA,
          'X-CSRFToken': csrf,
          'X-Instagram-AJAX': '1',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': 'https://www.instagram.com/',
          'Cookie': `csrftoken=${csrf}; ig_did=AAAAAAAAAAAAAAAAAAAAAAAA`,
        },
        body: new URLSearchParams({
          username: IG_USER,
          enc_password: encPassword,
          queryParams: '{}',
          optIntoOneTap: 'false',
        }).toString(),
      })
      const loginBody = await loginRes.text()
      const loginSetCookie = loginRes.headers.get('set-cookie') || ''
      const gotSession = loginSetCookie.includes('sessionid')
      results.instagram.step2 = {
        status: loginRes.status,
        gotSession,
        body: loginBody.slice(0, 500),
        setCookieSnippet: loginSetCookie.slice(0, 300),
      }

      // Step 3: if session, try profile lookup
      if (gotSession) {
        const sessionMatch = loginSetCookie.match(/sessionid=([^;,\s]+)/)
        const sessionId = sessionMatch?.[1]
        const profileRes = await fetch(
          'https://www.instagram.com/api/v1/users/web_profile_info/?username=carthrottle',
          {
            headers: {
              'User-Agent': UA,
              'Cookie': `sessionid=${sessionId}`,
              'X-IG-App-ID': '936619743392459',
            },
          }
        )
        const profileData = await profileRes.json() as any
        results.instagram.step3 = {
          status: profileRes.status,
          userId: profileData?.data?.user?.id,
          username: profileData?.data?.user?.username,
        }
      }
    }
  } catch (e) {
    results.instagram = { ...(results.instagram || {}), error: String(e) }
  }

  return NextResponse.json(results, { status: 200 })
}
