import Link from 'next/link';
import type { AdminRangeDays } from '@/lib/admin/range';

const OPTIONS: AdminRangeDays[] = [7, 30, 90];

export function AdminRangeLinks({ active }: { active: AdminRangeDays }) {
  return (
    <nav className="admin-range" aria-label="Date range">
      {OPTIONS.map((days) => (
        <Link
          key={days}
          href={`?days=${days}`}
          aria-current={active === days ? 'true' : undefined}
        >
          {days}d
        </Link>
      ))}
    </nav>
  );
}
