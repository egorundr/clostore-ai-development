import 'server-only'

import { db } from '@/lib/db'
import { user } from '@/lib/db/schema'

const PERSONAL_OWNER_ID = 'clostore-personal-owner'

export async function getPersonalWorkspaceUserId() {
  await db.insert(user).values({
    id: PERSONAL_OWNER_ID,
    name: 'Личное пространство',
    email: 'personal-owner@clostore.local',
  }).onConflictDoNothing({ target: user.id })

  return PERSONAL_OWNER_ID
}
