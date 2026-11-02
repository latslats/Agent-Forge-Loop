import { Bot, ChartColumn, type LucideIcon, Play, Plug } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { cn } from '../../lib/cn.ts'

const NAV: ReadonlyArray<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/', label: 'Agents', icon: Bot },
  { to: '/runs', label: 'Runs', icon: Play },
  { to: '/connections', label: 'Connections', icon: Plug },
  { to: '/insights', label: 'Insights', icon: ChartColumn },
]

// The Agents item also stays active on /agents/:id.
function isActive(to: string, pathname: string): boolean {
  if (to === '/') return pathname === '/' || pathname.startsWith('/agents/')
  return pathname === to
}

/** Sidebar with icons only below 1024 px; labels stay available to screen readers. */
export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <div className="flex min-h-dvh text-sm text-ink">
      <nav
        aria-label="Main"
        className="flex w-14 shrink-0 flex-col gap-1 border-r border-line bg-panel p-2 lg:w-60 lg:p-3"
      >
        <div className="mb-3 flex h-9 items-center gap-2.5 px-1">
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-control bg-accent text-sm font-semibold text-white"
          >
            E
          </span>
          <span className="sr-only font-semibold tracking-tight lg:not-sr-only">Agent Forge Loop</span>
        </div>
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = isActive(to, pathname)
          return (
            <Link
              key={to}
              to={to}
              title={label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-9 items-center gap-3 rounded-control px-2.5 font-medium transition-colors duration-150',
                active
                  ? 'bg-accent-soft text-accent-ink'
                  : 'text-muted hover:bg-sunken hover:text-ink',
              )}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className="sr-only lg:not-sr-only">{label}</span>
            </Link>
          )
        })}
      </nav>
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  )
}
