import { createClient } from '@/lib/supabase/client'

export async function logActivity(
  actionType: string,
  description: string,
  entityType?: string,
  entityId?: string
) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('activity_log') as any).insert({
    user_id: user.id,
    action_type: actionType,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    description,
  })
}
