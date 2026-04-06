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

  await supabase.from('activity_log').insert({
    user_id: user.id,
    action_type: actionType,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    description,
  })
}
