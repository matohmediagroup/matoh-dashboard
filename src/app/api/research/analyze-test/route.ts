export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function GET() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const assemblyKey  = process.env.ASSEMBLY_AI_API_KEY

  const result: Record<string, unknown> = {
    anthropic_key_set: !!anthropicKey,
    anthropic_key_prefix: anthropicKey ? anthropicKey.slice(0, 14) + '...' : 'MISSING',
    assembly_key_set: !!assemblyKey,
    assembly_key_prefix: assemblyKey ? assemblyKey.slice(0, 8) + '...' : 'MISSING',
  }

  // Try a minimal Claude call
  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = await client.messages.create({
        model: 'claude-opus-4-5' as any,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "ok"' }],
      })
      result.claude_test = 'success'
      result.claude_response = (msg.content[0] as { text: string }).text
    } catch (e) {
      result.claude_test = 'failed'
      result.claude_error = e instanceof Error ? e.message : String(e)
    }
  } else {
    result.claude_test = 'skipped — no key'
  }

  return NextResponse.json(result, { status: 200 })
}
