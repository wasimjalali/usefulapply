export interface LineChartSeries {
  id: string;
  name: string;
  values: Array<number | null>;
  focal?: boolean;
}

export interface LineChartProps {
  labels: string[];
  series: LineChartSeries[];
  ariaLabel: string;
  locale?: string;
  valueFormat?: Intl.NumberFormatOptions;
}

const WIDTH = 760;
const HEIGHT = 270;
const MARGIN = { top: 16, right: 104, bottom: 36, left: 52 } as const;
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;

function shortenLabel(label: string, maxLength = 16) {
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label;
}

export function LineChart({
  labels,
  series,
  ariaLabel,
  locale = 'en',
  valueFormat,
}: LineChartProps) {
  const allValues = series
    .flatMap((item) => item.values)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const rawMin = allValues.length ? Math.min(...allValues) : 0;
  const rawMax = allValues.length ? Math.max(...allValues) : 1;
  const spread = rawMax - rawMin;
  const padding = spread === 0 ? Math.abs(rawMax) * 0.1 || 1 : spread * 0.08;
  const yMin = rawMin >= 0 ? Math.max(0, rawMin - padding) : rawMin - padding;
  const yMax = rawMax + padding;
  const yRange = yMax - yMin || 1;
  const xAt = (index: number) =>
    MARGIN.left +
    (labels.length > 1 ? (index / (labels.length - 1)) * PLOT_WIDTH : PLOT_WIDTH / 2);
  const yAt = (value: number) => MARGIN.top + ((yMax - value) / yRange) * PLOT_HEIGHT;
  const ticks = [yMax, yMin + yRange / 2, yMin];
  const tickIndexes =
    labels.length > 2
      ? [0, Math.floor((labels.length - 1) / 2), labels.length - 1]
      : labels.map((_, index) => index);
  const formatter = new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
    ...valueFormat,
  });

  const pathFor = (values: Array<number | null>) => {
    let drawing = false;

    return values
      .slice(0, labels.length)
      .map((value, index) => {
        if (value === null || !Number.isFinite(value)) {
          drawing = false;
          return '';
        }

        const command = drawing ? 'L' : 'M';
        drawing = true;
        return `${command}${xAt(index).toFixed(1)},${yAt(value).toFixed(1)}`;
      })
      .filter(Boolean)
      .join(' ');
  };

  return (
    <div className="admin-line-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={ariaLabel}>
        <g aria-hidden="true">
          {ticks.map((tick) => {
            const y = yAt(tick);
            return (
              <g key={tick}>
                <line
                  className="admin-line-chart__grid"
                  x1={MARGIN.left}
                  x2={WIDTH - MARGIN.right}
                  y1={y}
                  y2={y}
                />
                <text className="admin-line-chart__tick" x={MARGIN.left - 10} y={y + 4} textAnchor="end">
                  {formatter.format(tick)}
                </text>
              </g>
            );
          })}

          {tickIndexes.map((index) => (
            <text
              className="admin-line-chart__tick"
              key={`${labels[index]}-${index}`}
              x={xAt(index)}
              y={HEIGHT - 10}
              textAnchor={index === 0 ? 'start' : index === labels.length - 1 ? 'end' : 'middle'}
            >
              {shortenLabel(labels[index])}
            </text>
          ))}

          {series.map((item) => {
            const visibleValues = item.values.slice(0, labels.length);
            const lastIndex = visibleValues.findLastIndex(
              (value) => value !== null && Number.isFinite(value),
            );
            const lastValue = lastIndex >= 0 ? visibleValues[lastIndex] : null;

            return (
              <g key={item.id}>
                <path
                  className={
                    item.focal
                      ? 'admin-line-chart__series admin-line-chart__series--focal'
                      : 'admin-line-chart__series'
                  }
                  d={pathFor(item.values)}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                />
                {lastValue !== null && lastValue !== undefined && Number.isFinite(lastValue) ? (
                  <text
                    className={
                      item.focal
                        ? 'admin-line-chart__label admin-line-chart__label--focal'
                        : 'admin-line-chart__label'
                    }
                    x={xAt(lastIndex) + 10}
                    y={yAt(lastValue) + 4}
                  >
                    {shortenLabel(item.name, 14)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
