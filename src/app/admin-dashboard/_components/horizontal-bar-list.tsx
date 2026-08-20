export interface HorizontalBarDatum {
  id: string;
  label: string;
  value: number;
  valueLabel: string;
  focal?: boolean;
}

export interface HorizontalBarListProps {
  data: HorizontalBarDatum[];
  ariaLabel: string;
  maxValue?: number;
}

export function HorizontalBarList({ data, ariaLabel, maxValue }: HorizontalBarListProps) {
  const resolvedMax = Math.max(maxValue ?? 0, ...data.map((item) => item.value), 0);

  return (
    <div className="admin-bars" role="list" aria-label={ariaLabel}>
      {data.map((item) => {
        const percentage = resolvedMax > 0 ? Math.max(0, Math.min(100, (item.value / resolvedMax) * 100)) : 0;

        return (
          <div className={`admin-bar-row${item.focal ? ' admin-bar-row--focal' : ''}`} role="listitem" key={item.id}>
            <span className="admin-bar-row__label">{item.label}</span>
            <span className="admin-bar-row__track" aria-hidden="true">
              <span className="admin-bar-row__fill" style={{ width: `${percentage}%` }} />
            </span>
            <strong>{item.valueLabel}</strong>
          </div>
        );
      })}
    </div>
  );
}
