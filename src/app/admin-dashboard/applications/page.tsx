import { getAdminApplications } from '@/db/repos/admin-dashboard';
import { adminRangeLabel, parseAdminRange } from '@/lib/admin/range';
import { loadAdminPageData } from '@/lib/admin/page-access';
import { AdminPageHeader, AdminRangeLinks, AdminSection, DataTable, HorizontalBarList, MetricSurface, SourceState } from '../_components';
import { formatDate, formatNumber, statusTone } from '../_lib/presentation';

type SearchParams = Promise<{ days?: string | string[] }>;

export default async function AdminApplicationsPage({ searchParams }: { searchParams: SearchParams }) {
  const days = parseAdminRange((await searchParams).days);
  const data = await loadAdminPageData(() => getAdminApplications(days));

  return (
    <div className="admin-page-stack">
      <AdminPageHeader
        title="Applications"
        dateLabel={adminRangeLabel(days)}
        sourceStatus={{ label: 'D1 live', tone: 'available' }}
        actions={<AdminRangeLinks active={days} />}
      />
      <MetricSurface
        ariaLabel="Application metrics"
        metrics={[
          { label: 'Workspaces created', value: formatNumber(data.totals.created) },
          { label: 'Completed kits', value: formatNumber(data.totals.succeeded), detail: 'Completion events in period' },
          { label: 'Generation failures', value: formatNumber(data.totals.failed), detailTone: data.totals.failed ? 'negative' : 'neutral' },
          { label: 'Advanced beyond draft', value: formatNumber(data.totals.applied), detail: 'Current status, updated in period' },
        ]}
      />
      <AdminSection title="Current tracker status">
        <HorizontalBarList
          ariaLabel="Application tracker status counts"
          data={data.statusCounts.map((row) => ({ id: row.status, label: row.status.replace('_', ' '), value: row.value, valueLabel: formatNumber(row.value), focal: row.status === 'applied' }))}
        />
      </AdminSection>
      <AdminSection title="Recent workspaces" meta="No CV or job description content shown">
        <DataTable
          caption="Recent application workspaces"
          getRowKey={(row) => row.id}
          rows={data.recent}
          columns={[
            { key: 'role', header: 'Role', render: (row) => row.jobTitle ?? 'Untitled role' },
            { key: 'company', header: 'Company', render: (row) => row.company ?? 'Unknown company' },
            { key: 'tracker', header: 'Tracker', render: (row) => <span className="admin-status" data-tone={statusTone(row.status)}>{row.status.replace('_', ' ')}</span> },
            { key: 'generation', header: 'Generation', render: (row) => <span className="admin-status" data-tone={statusTone(row.generationStatus)}>{row.generationStatus}</span> },
            { key: 'match', header: 'Match', align: 'right', render: (row) => row.matchScore === null ? 'Unavailable' : `${row.matchScore}%` },
            { key: 'created', header: 'Created', render: (row) => formatDate(row.createdAt) },
          ]}
          emptyState={<SourceState kind="empty" title="No workspaces found" />}
        />
      </AdminSection>
    </div>
  );
}
