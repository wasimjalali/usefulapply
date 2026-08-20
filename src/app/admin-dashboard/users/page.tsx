import { getAdminUsers } from '@/db/repos/admin-dashboard';
import { adminRangeLabel, parseAdminRange } from '@/lib/admin/range';
import { loadAdminPageData } from '@/lib/admin/page-access';
import { AdminPageHeader, AdminRangeLinks, AdminSection, DataTable, MetricSurface, SourceState } from '../_components';
import { formatDate, formatDecimal, formatNumber, formatPercent, statusTone } from '../_lib/presentation';

type SearchParams = Promise<{ days?: string | string[] }>;

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const days = parseAdminRange((await searchParams).days);
  const data = await loadAdminPageData(() => getAdminUsers(days));

  return (
    <div className="admin-page-stack">
      <AdminPageHeader
        title="Users"
        dateLabel={adminRangeLabel(days)}
        sourceStatus={{ label: data.coverage === 'complete' ? 'D1 live' : `Auth metrics ${data.coverage}`, tone: data.coverage === 'complete' ? 'available' : 'partial' }}
        actions={<AdminRangeLinks active={days} />}
      />
      <MetricSurface
        ariaLabel="User metrics"
        metrics={[
          { label: 'Signups', value: data.coverage === 'unavailable' ? 'Unavailable' : formatNumber(data.totals.signups), detail: data.coverage === 'complete' ? adminRangeLabel(days) : `Partial since ${formatDate(data.trackingStartedAt)}`, detailTone: data.coverage === 'complete' ? 'neutral' : 'warning' },
          { label: 'Current accounts created', value: formatNumber(data.totals.created), detail: 'Excludes deleted accounts' },
          { label: 'Verified accounts', value: formatNumber(data.totals.verified) },
          { label: 'Session starts', value: data.coverage === 'unavailable' ? 'Unavailable' : formatNumber(data.totals.sessionStarts), detail: data.coverage === 'complete' ? adminRangeLabel(days) : `Partial since ${formatDate(data.trackingStartedAt)}`, detailTone: data.coverage === 'complete' ? 'neutral' : 'warning' },
          { label: 'Signed-in accounts', value: data.coverage === 'unavailable' ? 'Unavailable' : formatNumber(data.totals.distinctSignedIn), detail: data.coverage === 'complete' ? 'Distinct accounts in range' : 'Partial tracking window', detailTone: data.coverage === 'complete' ? 'neutral' : 'warning' },
          { label: 'Verification rate', value: formatPercent(data.totals.verified, data.totals.accounts), detail: 'Current account snapshot' },
        ]}
      />
      <AdminSection title="Recent accounts" meta="Email addresses are masked">
        <DataTable
          caption="Recent Useful Apply accounts"
          getRowKey={(row) => row.id}
          rows={data.recent}
          columns={[
            { key: 'email', header: 'Account', render: (row) => row.email },
            { key: 'verified', header: 'Verification', render: (row) => <span className="admin-status" data-tone={row.emailVerified ? 'good' : 'warning'}>{row.emailVerified ? 'Verified' : 'Pending'}</span> },
            { key: 'tier', header: 'Plan', render: (row) => <span className="admin-status" data-tone={statusTone(row.tier ?? 'free')}>{row.tier ?? 'free'}</span> },
            { key: 'credits', header: 'Credits', align: 'right', render: (row) => formatDecimal(row.credits ?? 0) },
            { key: 'applications', header: 'Applications', align: 'right', render: (row) => formatNumber(row.applications) },
            { key: 'joined', header: 'Joined', render: (row) => formatDate(row.createdAt) },
          ]}
          emptyState={<SourceState kind="empty" title="No accounts found" />}
        />
      </AdminSection>
    </div>
  );
}
