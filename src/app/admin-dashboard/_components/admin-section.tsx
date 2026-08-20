import type { ReactNode } from 'react';

export interface AdminSectionProps {
  title?: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AdminSection({ title, meta, children, className = '' }: AdminSectionProps) {
  return (
    <section className={`admin-section ${className}`.trim()}>
      {title || meta ? (
        <header className="admin-section__header">
          {title ? <h2>{title}</h2> : <span />}
          {meta ? <div className="admin-section__meta">{meta}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
