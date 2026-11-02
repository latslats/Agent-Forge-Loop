import { Check, X } from 'lucide-react'
import { cn } from '../../lib/cn.ts'

export function PassMark({ pass }: { pass: boolean }) {
  const Icon = pass ? Check : X
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium',
        pass ? 'text-active' : 'text-danger',
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {pass ? 'Pass' : 'Fail'}
    </span>
  )
}
