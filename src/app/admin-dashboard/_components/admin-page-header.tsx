import type { ReactNode } from 'react';
import { CalendarDays, Database } from 'lucide-react';

export type AdminSourceTone = 'available' | 'partial' | 'unavailable';

export interface AdminSourceStatus {
  label: string;
  tone: AdminSourceTone;
}

export interface AdminPageHeaderProps {
  title: string;
  dateLabel?: string;
  sourceStatus?: AdminSourceStatus;
  actions?: ReactNode;
}

export function AdminPageHeader({
  title,
  dateLabel,
  sourceStatus,
  actions,
}: AdminPageHeaderProps) {
  return (
    <header className="admin-page-header">
      <h1>{title}</h1>

      <div className="admin-page-header__meta">
        {dateLabel ? (
          <span className="admin-page-header__meta-item">
            <CalendarDays aria-hidden="true" strokeWidth={1.5} />
            {dateLabel}
          </span>
        ) : null}
        {sourceStatus ? (
          <span
            className={`admin-page-header__meta-item admin-source-status admin-source-status--${sourceStatus.tone}`}
          >
            <Database aria-hidden="true" strokeWidth={1.5} />
            {sourceStatus.label}
          </span>
        ) : null}
        {actions}
      </div>
    </header>
  );
}
