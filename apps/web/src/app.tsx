import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Outlet } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AppShell } from './components/layout/app-shell.tsx'
import { EmptyState } from './components/ui/empty-state.tsx'
import { ToastProvider } from './components/ui/toast.tsx'
import { AgentPage } from './pages/agent.tsx'
import { AgentsPage } from './pages/agents.tsx'
import { ConnectionsPage } from './pages/connections.tsx'
import { InsightsPage } from './pages/insights.tsx'
import { RunPage } from './pages/run.tsx'
import { RunsPage } from './pages/runs.tsx'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } })

function Layout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

const router = createBrowserRouter([
  {
    Component: Layout,
    children: [
      { index: true, Component: AgentsPage },
      { path: 'agents/:id', Component: AgentPage },
      { path: 'runs', Component: RunsPage },
      { path: 'runs/:id', Component: RunPage },
      { path: 'connections', Component: ConnectionsPage },
      { path: 'insights', Component: InsightsPage },
      {
        path: '*',
        element: (
          <div className="p-6">
            <EmptyState
              title="Page not found"
              description="Pick a section from the sidebar to keep going."
            />
          </div>
        ),
      },
    ],
  },
])

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  )
}
