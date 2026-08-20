'use client';

import type { ReactNode } from 'react';
import { Activity, Bot, BriefcaseBusiness, CreditCard, LayoutDashboard, Users } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { AdminShell, type AdminNavigationItem } from './admin-shell';

const NAVIGATION: Omit<AdminNavigationItem, 'active'>[] = [
  { label: 'Overview', href: '/admin-dashboard', icon: LayoutDashboard },
  { label: 'Users', href: '/admin-dashboard/users', icon: Users },
  { label: 'Applications', href: '/admin-dashboard/applications', icon: BriefcaseBusiness },
  { label: 'AI and costs', href: '/admin-dashboard/ai-costs', icon: Bot },
  { label: 'Billing and credits', href: '/admin-dashboard/billing', icon: CreditCard },
  { label: 'Operations', href: '/admin-dashboard/operations', icon: Activity },
];

export function AdminNavigationShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const navigation = NAVIGATION.map((item) => ({
    ...item,
    active: item.href === '/admin-dashboard' ? pathname === item.href : pathname.startsWith(item.href),
  }));

  return (
    <AdminShell navigation={navigation} sidebarFooter="Cloudflare Access protected">
      {children}
    </AdminShell>
  );
}
