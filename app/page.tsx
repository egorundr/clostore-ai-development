import { getAgentTasks } from '@/app/actions/agent'
import { CloStoreApp } from '@/components/clostore/app-shell'
import { getIntegrationStatuses } from '@/lib/integrations/status'
import { getPersonalWorkspaceUserId } from '@/lib/personal-workspace'
import { getWorkspaceData } from '@/lib/workspace-data'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const userId = await getPersonalWorkspaceUserId()
  const [data, agentTasks, integrations] = await Promise.all([getWorkspaceData(userId), getAgentTasks(), getIntegrationStatuses()])

  return <CloStoreApp initialData={data} initialAgentTasks={agentTasks} integrations={integrations} />
}
