import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn.ts'

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('rounded-surface border border-line bg-panel', className)} {...props} />
}
