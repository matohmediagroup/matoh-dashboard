'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  DollarSign,
  Video,
  CheckSquare,
  ListTodo,
  Calendar,
  LogOut,
  ChevronLeft,
  BarChart2,
  Tv2,
  FlaskConical,
  BookOpen,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Role } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  roles: Role[]
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Home',
    href: '/dashboard',
    icon: LayoutDashboard,
    roles: ['owner', 'manager', 'editor', 'videographer', 'researcher'],
  },
  {
    label: 'Social Media',
    href: '/social',
    icon: BarChart2,
    roles: ['owner', 'manager'],
  },
  {
    label: 'Content Schedule',
    href: '/content',
    icon: CalendarDays,
    roles: ['owner', 'manager', 'editor'],
  },
  {
    label: 'Content Research',
    href: '/research',
    icon: TrendingUp,
    roles: ['owner', 'manager'],
  },
  {
    label: 'Script Generator',
    href: '/scripts',
    icon: FlaskConical,
    roles: ['owner', 'manager'],
  },
  {
    label: 'Agency Calendar',
    href: '/calendar',
    icon: Calendar,
    roles: ['owner', 'manager'],
  },
  {
    label: 'Clients',
    href: '/clients',
    icon: Users,
    roles: ['owner', 'manager'],
  },
  {
    label: 'Finance',
    href: '/finance',
    icon: DollarSign,
    roles: ['owner'],
  },
  {
    label: 'Videographer',
    href: '/videographer',
    icon: Video,
    roles: ['owner', 'manager', 'videographer'],
  },
  {
    label: 'SOP Library',
    href: '/sops',
    icon: BookOpen,
    roles: ['owner', 'manager', 'editor', 'videographer', 'researcher'],
  },
  {
    label: 'My Todos',
    href: '/todos',
    icon: CheckSquare,
    roles: ['owner', 'manager', 'editor', 'videographer', 'researcher'],
  },
  {
    label: 'Team Todos',
    href: '/todos/team',
    icon: ListTodo,
    roles: ['owner', 'manager'],
  },
]

interface SidebarProps {
  role: Role
  userName: string
}

export default function Sidebar({ role, userName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role))

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-[#202020] border-r border-[#2e2e2e] transition-all duration-200 flex-shrink-0',
        collapsed ? 'w-[56px]' : 'w-[220px]'
      )}
    >
      {/* Header */}
      <div className={cn('flex items-center h-14 border-b border-[#2e2e2e] px-3', collapsed ? 'justify-center' : 'justify-between')}>
        {!collapsed && (
          <span className="text-[#e8e8e8] font-semibold text-sm truncate">Matoh Media</span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-chip text-[#888] hover:text-[#e8e8e8] hover:bg-[#2e2e2e] transition-colors"
        >
          <ChevronLeft
            size={16}
            className={cn('transition-transform', collapsed && 'rotate-180')}
          />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {visibleItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 mx-1 my-0.5 rounded-card text-sm transition-colors',
                isActive
                  ? 'bg-[#4f8ef7]/15 text-[#4f8ef7]'
                  : 'text-[#888] hover:text-[#e8e8e8] hover:bg-[#252525]',
                collapsed && 'justify-center px-0'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={16} className="flex-shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-[#2e2e2e] p-2">
        {!collapsed && (
          <div className="px-2 py-1.5 mb-1">
            <p className="text-xs font-medium text-[#e8e8e8] truncate">{userName}</p>
            <p className="text-xs text-[#888] capitalize">{role}</p>
          </div>
        )}
        <button
          onClick={handleSignOut}
          className={cn(
            'flex items-center gap-3 w-full px-2 py-2 rounded-card text-sm text-[#888] hover:text-[#ef4444] hover:bg-[#252525] transition-colors',
            collapsed && 'justify-center'
          )}
          title={collapsed ? 'Sign out' : undefined}
        >
          <LogOut size={16} className="flex-shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  )
}
