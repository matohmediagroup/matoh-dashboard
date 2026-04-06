import { cn } from '@/lib/utils'
import { type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className, id, ...props }: InputProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-xs font-medium text-[#888]">
          {label}
        </label>
      )}
      <input
        id={id}
        className={cn(
          'w-full px-3 py-2 rounded-card bg-[#191919] border border-[#2e2e2e] text-[#e8e8e8] text-sm placeholder-[#555] focus:outline-none focus:border-[#4f8ef7] transition-colors',
          error && 'border-[#ef4444]',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-[#ef4444]">{error}</p>}
    </div>
  )
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  children: React.ReactNode
}

export function Select({ label, id, className, children, ...props }: SelectProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-xs font-medium text-[#888]">
          {label}
        </label>
      )}
      <select
        id={id}
        className={cn(
          'w-full px-3 py-2 rounded-card bg-[#191919] border border-[#2e2e2e] text-[#e8e8e8] text-sm focus:outline-none focus:border-[#4f8ef7] transition-colors',
          className
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export function Textarea({ label, id, className, ...props }: TextareaProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-xs font-medium text-[#888]">
          {label}
        </label>
      )}
      <textarea
        id={id}
        className={cn(
          'w-full px-3 py-2 rounded-card bg-[#191919] border border-[#2e2e2e] text-[#e8e8e8] text-sm placeholder-[#555] focus:outline-none focus:border-[#4f8ef7] transition-colors resize-none',
          className
        )}
        {...props}
      />
    </div>
  )
}
