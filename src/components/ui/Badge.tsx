import { cn } from '@/lib/utils'

type BadgeVariant =
  | 'default'
  | 'active'
  | 'inactive'
  | 'filmed'
  | 'not_filmed'
  | 'in_progress'
  | 'revisions'
  | 'done'
  | 'unassigned'
  | 'paid'
  | 'unpaid'
  | 'overdue'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'not_filmed_script'
  | 'partially_filmed'
  | 'fully_filmed'
  | 'todo'
  | 'meeting'
  | 'call'
  | 'owner'
  | 'manager'
  | 'editor'
  | 'videographer'
  | 'researcher'

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-[#2e2e2e] text-[#888]',
  active: 'bg-[#10b981]/15 text-[#10b981]',
  inactive: 'bg-[#6b7280]/15 text-[#6b7280]',
  filmed: 'bg-[#10b981]/15 text-[#10b981]',
  not_filmed: 'bg-[#6b7280]/15 text-[#6b7280]',
  in_progress: 'bg-[#4f8ef7]/15 text-[#4f8ef7]',
  revisions: 'bg-[#f59e0b]/15 text-[#f59e0b]',
  done: 'bg-[#10b981]/15 text-[#10b981]',
  unassigned: 'bg-[#2e2e2e] text-[#888]',
  paid: 'bg-[#10b981]/15 text-[#10b981]',
  unpaid: 'bg-[#f59e0b]/15 text-[#f59e0b]',
  overdue: 'bg-[#ef4444]/15 text-[#ef4444]',
  pending: 'bg-[#f59e0b]/15 text-[#f59e0b]',
  approved: 'bg-[#10b981]/15 text-[#10b981]',
  rejected: 'bg-[#ef4444]/15 text-[#ef4444]',
  not_filmed_script: 'bg-[#6b7280]/15 text-[#6b7280]',
  partially_filmed: 'bg-[#f59e0b]/15 text-[#f59e0b]',
  fully_filmed: 'bg-[#10b981]/15 text-[#10b981]',
  todo: 'bg-[#2e2e2e] text-[#888]',
  meeting: 'bg-[#4f8ef7]/15 text-[#4f8ef7]',
  call: 'bg-[#8b5cf6]/15 text-[#8b5cf6]',
  owner: 'bg-[#4f8ef7]/15 text-[#4f8ef7]',
  manager: 'bg-[#8b5cf6]/15 text-[#8b5cf6]',
  editor: 'bg-[#10b981]/15 text-[#10b981]',
  videographer: 'bg-[#f59e0b]/15 text-[#f59e0b]',
  researcher: 'bg-[#6b7280]/15 text-[#6b7280]',
}

const variantLabels: Partial<Record<BadgeVariant, string>> = {
  not_filmed: 'Not Filmed',
  in_progress: 'In Progress',
  not_filmed_script: 'Not Filmed',
  partially_filmed: 'Partial',
  fully_filmed: 'Fully Filmed',
  todo: 'To Do',
}

interface BadgeProps {
  variant?: BadgeVariant
  label?: string
  className?: string
  color?: string // custom hex color for client chips
}

export function Badge({ variant = 'default', label, className, color }: BadgeProps) {
  const displayLabel = label ?? variantLabels[variant] ?? variant.replace(/_/g, ' ')

  if (color) {
    return (
      <span
        className={cn('inline-flex items-center px-2 py-0.5 rounded-chip text-xs font-medium capitalize', className)}
        style={{ backgroundColor: `${color}22`, color }}
      >
        {displayLabel}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-chip text-xs font-medium capitalize',
        variantStyles[variant],
        className
      )}
    >
      {displayLabel}
    </span>
  )
}
