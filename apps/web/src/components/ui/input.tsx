import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn.ts'
import { fieldClass } from './field.tsx'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(fieldClass, 'h-9', className)} {...props} />
}
