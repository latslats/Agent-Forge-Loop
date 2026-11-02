import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn.ts'
import { fieldClass } from './field.tsx'

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(fieldClass, 'py-2 leading-relaxed', className)} {...props} />
}
