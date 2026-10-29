import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '~/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'ghost' | 'icon'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  icon?: LucideIcon
  children?: ReactNode
  'aria-label'?: string
}

export function Button({
  variant = 'secondary',
  icon: Icon,
  children,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  const variantClass = {
    primary: 'nr-btn-primary',
    secondary: '',
    accent: 'nr-btn-accent',
    ghost: 'nr-btn-ghost',
    icon: 'nr-btn-icon',
  }[variant]

  return (
    <button
      type={type}
      className={cn('nr-btn', variantClass, className)}
      {...props}
    >
      {Icon && <Icon className="nr-icon" size={18} strokeWidth={1.75} aria-hidden="true" />}
      {children}
    </button>
  )
}
