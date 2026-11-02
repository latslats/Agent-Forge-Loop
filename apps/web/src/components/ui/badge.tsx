import type { ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

export type BadgeTone = 'neutral' | 'accent' | 'draft' | 'active' | 'paused'

const tones: Record<BadgeTone, string> = {
  neutral: 'border border-line text-muted',
  accent: 'bg-accent-soft text-accent-ink',
  draft: 'border border-line text-muted',
  active: 'border border-line text-ink',
  paused: 'border border-line text-ink',
}

// Status tones get a pilot-light dot. The active dot also gets a soft halo.
const dots: Partial<Record<BadgeTone, string>> = {
  draft: 'bg-graphite',
  active: 'bg-active ring-3 ring-active/25',
  paused: 'bg-paused',
}

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone
  className?: string
  children: ReactNode
}) {
  const dot = dots[tone]
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-control px-2 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {dot && <span aria-hidden="true" className={cn('size-1.5 rounded-full', dot)} />}
      {children}
    </span>
  )
}
