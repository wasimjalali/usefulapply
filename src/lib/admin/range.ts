export type AdminRangeDays = 7 | 30 | 90;

export function parseAdminRange(value: string | string[] | undefined): AdminRangeDays {
  const resolved = Array.isArray(value) ? value[0] : value;
  if (resolved === '7') return 7;
  if (resolved === '90') return 90;
  return 30;
}

export function adminRangeStart(days: AdminRangeDays, now = new Date()): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function adminRangeLabel(days: AdminRangeDays): string {
  return `Last ${days} days`;
}
