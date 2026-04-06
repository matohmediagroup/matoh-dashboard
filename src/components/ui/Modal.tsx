'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  width?: 'sm' | 'md' | 'lg' | 'xl'
}

export function Modal({ open, onClose, title, children, width = 'md' }: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const widthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
  }[width]

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.target === backdropRef.current && onClose()}
    >
      <div className={cn('w-full bg-[#202020] border border-[#2e2e2e] rounded-card', widthClass)}>
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#2e2e2e]">
            <h2 className="text-base font-semibold text-[#e8e8e8]">{title}</h2>
            <button
              onClick={onClose}
              className="p-1 rounded-chip text-[#888] hover:text-[#e8e8e8] hover:bg-[#2e2e2e] transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
