import { AlertCircle, CircleDashed, Database, Loader2 } from 'lucide-react';

export type SourceStateKind = 'loading' | 'empty' | 'unavailable' | 'error';

export interface SourceStateProps {
  kind: SourceStateKind;
  title: string;
  message?: string;
}

const STATE_ICONS = {
  loading: Loader2,
  empty: CircleDashed,
  unavailable: Database,
  error: AlertCircle,
} as const;

export function SourceState({ kind, title, message }: SourceStateProps) {
  const Icon = STATE_ICONS[kind];

  return (
    <div className={`admin-state admin-state--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon className="admin-state__icon" aria-hidden="true" strokeWidth={1.5} />
      <div>
        <h2>{title}</h2>
        {message ? <p>{message}</p> : null}
      </div>
    </div>
  );
}
