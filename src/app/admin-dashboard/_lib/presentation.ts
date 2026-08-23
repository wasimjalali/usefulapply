import type { AdminTrendPoint } from '@/db/repos/admin-dashboard';

export const numberFormatter = new Intl.NumberFormat('en-US');
export const decimalFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
export const percentFormatter = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatDecimal(value: number): string {
  return decimalFormatter.format(value);
}

export function formatPercent(numerator: number, denominator: number): string {
  return denominator === 0 ? 'Unavailable' : percentFormatter.format(numerator / denominator);
}

export function formatDate(value: string | number | null): string {
  if (value === null) return 'Unavailable';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date);
}

export function trendForRange(points: AdminTrendPoint[], days: number): { labels: string[]; values: number[] } {
  const byDay = new Map(points.map((point) => [point.day, point.value]));
  const labels: string[] = [];
  const values: number[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - offset);
    const day = date.toISOString().slice(0, 10);
    labels.push(day);
    values.push(byDay.get(day) ?? 0);
  }
  return { labels, values };
}

export function statusTone(status: string): 'good' | 'warning' | 'bad' | 'neutral' {
  if (['active', 'completed', 'succeeded', 'accepted', 'applied', 'interview'].includes(status)) return 'good';
  if (['queued', 'running', 'pending', 'trialing', 'follow_up'].includes(status)) return 'warning';
  if (['failed', 'past_due', 'rejected', 'cancelled', 'expired'].includes(status)) return 'bad';
  return 'neutral';
}
