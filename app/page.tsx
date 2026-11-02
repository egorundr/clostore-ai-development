import { CloStoreApp } from '@/components/clostore/app-shell'
import { getPersonalWorkspaceUserId } from '@/lib/personal-workspace'
import { getWorkspaceData } from '@/lib/workspace-data'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const userId = await getPersonalWorkspaceUserId()
  const data = await getWorkspaceData(userId)

  return <CloStoreApp initialData={data} />
}
