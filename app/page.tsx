import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { CloStoreApp } from '@/components/clostore/app-shell'
import { auth } from '@/lib/auth'
import { getWorkspaceData } from '@/lib/workspace-data'

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')

  const data = await getWorkspaceData(session.user.id)

  return <CloStoreApp initialData={data} user={{ name: session.user.name, email: session.user.email }} />
}
