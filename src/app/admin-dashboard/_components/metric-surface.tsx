export type MetricDetailTone = 'neutral' | 'positive' | 'warning' | 'negative';

export interface AdminMetric {
  label: string;
  value: string;
  detail?: string;
  detailTone?: MetricDetailTone;
}

export interface MetricSurfaceProps {
  metrics: AdminMetric[];
  ariaLabel: string;
}

export function MetricSurface({ metrics, ariaLabel }: MetricSurfaceProps) {
  return (
    <section className="admin-metrics" aria-label={ariaLabel}>
      {metrics.map((metric) => (
        <div className="admin-metric" key={metric.label}>
          <span className="admin-metric__label">{metric.label}</span>
          <strong className="admin-metric__value">{metric.value}</strong>
          {metric.detail ? (
            <span className={`admin-metric__detail admin-metric__detail--${metric.detailTone ?? 'neutral'}`}>
              {metric.detail}
            </span>
          ) : null}
        </div>
      ))}
    </section>
  );
}
