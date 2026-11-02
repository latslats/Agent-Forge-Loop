import type { ReactNode } from 'react'

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-surface border border-dashed border-line px-6 py-12 text-center">
      {icon && (
        <span className="grid size-10 place-items-center rounded-control bg-accent-soft text-accent-ink">
          {icon}
        </span>
      )}
      <div className="max-w-md space-y-1">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted">{description}</p>
      </div>
      {action}
    </section>
  )
}
