import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Monitor } from 'lucide-react';
import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';
import '../admin-dashboard.css';

export interface AdminNavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
  active?: boolean;
}

export interface AdminShellProps {
  navigation: AdminNavigationItem[];
  children: ReactNode;
  areaLabel?: string;
  sidebarFooter?: ReactNode;
}

export function AdminShell({
  navigation,
  children,
  areaLabel = 'Admin',
  sidebarFooter,
}: AdminShellProps) {
  return (
    <>
      <div className="admin-desktop-required">
        <Monitor aria-hidden="true" strokeWidth={1.5} />
        <h1>This dashboard needs a larger screen</h1>
        <p>Open it on a tablet or desktop.</p>
      </div>

      <div className="admin-shell">
        <aside className="admin-sidebar">
          <div className="admin-sidebar__brand">
            <span className="admin-sidebar__logo-full">
              <BrandLogo variant="full" size="xs" theme="light" />
            </span>
            <span className="admin-sidebar__logo-mark">
              <BrandLogo variant="icon" size="xs" theme="light" />
            </span>
            <span className="admin-sidebar__area">{areaLabel}</span>
          </div>

          <nav aria-label={`${areaLabel} navigation`} className="admin-sidebar__nav">
            {navigation.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  aria-current={item.active ? 'page' : undefined}
                  className="admin-sidebar__link"
                >
                  <Icon aria-hidden="true" strokeWidth={1.5} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {sidebarFooter ? <div className="admin-sidebar__footer">{sidebarFooter}</div> : null}
        </aside>

        <main className="admin-main">{children}</main>
      </div>
    </>
  );
}
