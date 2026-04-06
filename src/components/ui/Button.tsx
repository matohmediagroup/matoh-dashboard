import { cn } from '@/lib/utils'
import { type ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium rounded-card transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        variant === 'primary' && 'bg-[#4f8ef7] hover:bg-[#3a7de8] text-white',
        variant === 'ghost' && 'text-[#888] hover:text-[#e8e8e8] hover:bg-[#252525]',
        variant === 'danger' && 'bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-[#ef4444]',
        variant === 'outline' && 'border border-[#2e2e2e] text-[#e8e8e8] hover:bg-[#252525]',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
