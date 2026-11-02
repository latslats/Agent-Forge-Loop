import { PageHeader } from '../components/layout/page-header.tsx'
import { ConnectionsList } from '../features/connections/connections-list.tsx'

export function ConnectionsPage() {
  return (
    <>
      <PageHeader
        title="Connections"
        description="Built-in tools and MCP servers that agents can use."
      />
      <div className="p-6">
        <ConnectionsList />
      </div>
    </>
  )
}
