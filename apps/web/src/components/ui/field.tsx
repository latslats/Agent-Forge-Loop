import type { ReactNode } from 'react'

/** Shared look for text inputs, textareas and select triggers. */
export const fieldClass =
  'w-full rounded-control border border-graphite bg-panel px-3 text-sm text-ink placeholder:text-muted transition-colors duration-150 focus:border-accent'

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}
