import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn.ts'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

export type ButtonProps = ComponentProps<'button'> & {
  variant?: Variant
  size?: Size
}

const variants: Record<Variant, string> = {
  primary: 'border-transparent bg-accent text-white hover:brightness-110',
  secondary: 'border-line bg-panel text-ink hover:bg-sunken',
  ghost: 'border-transparent text-muted hover:bg-sunken hover:text-ink',
  danger: 'border-transparent bg-danger-solid text-white hover:brightness-110',
}

const sizes: Record<Size, string> = {
  sm: 'h-7 gap-1.5 px-2.5 text-[13px]',
  md: 'h-9 gap-2 px-3.5 text-sm',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-control border font-medium transition-[background-color,filter,color] duration-150 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}
