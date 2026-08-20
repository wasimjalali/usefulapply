import { getAdminOverview } from '@/db/repos/admin-dashboard';
import { adminRangeLabel, parseAdminRange } from '@/lib/admin/range';
import { loadAdminPageData } from '@/lib/admin/page-access';
import {
  AdminPageHeader,
  AdminRangeLinks,
  AdminSection,
  ApplicantJourneyRail,
  DataTable,
  LineChart,
  MetricSurface,
  SourceState,
} from './_components';
import { formatDate, formatNumber, formatPercent, trendForRange } from './_lib/presentation';

type SearchParams = Promise<{ days?: string | string[] }>;

export default async function AdminOverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const days = parseAdminRange((await searchParams).days);
  const data = await loadAdminPageData(() => getAdminOverview(days));
  const accounts = trendForRange(data.accountTrend, days);
  const applications = trendForRange(data.applicationTrend, days);
  const journey = data.journey;

  return (
    <div className="admin-page-stack">
      <AdminPageHeader
        title="Overview"
        dateLabel={adminRangeLabel(days)}
        sourceStatus={{
          label: data.authCoverage === 'complete' ? 'D1 live' : `Auth metrics ${data.authCoverage}`,
          tone: data.authCoverage === 'complete' ? 'available' : 'partial',
        }}
        actions={<AdminRangeLinks active={days} />}
      />
      <MetricSurface
        ariaLabel="Key business metrics"
        metrics={[
          { label: 'Signups', value: data.authCoverage === 'unavailable' ? 'Unavailable' : formatNumber(data.totals.signups), detail: data.authCoverage === 'complete' ? `${formatNumber(data.totals.accounts)} current accounts` : `Partial since ${formatDate(data.authTrackingStartedAt)}`, detailTone: data.authCoverage === 'complete' ? 'neutral' : 'warning' },
          { label: 'Session starts', value: data.authCoverage === 'unavailable' ? 'Unavailable' : formatNumber(data.totals.sessionStarts), detail: data.authCoverage === 'complete' ? adminRangeLabel(days) : `Partial since ${formatDate(data.authTrackingStartedAt)}`, detailTone: data.authCoverage === 'complete' ? 'neutral' : 'warning' },
          { label: 'Application workspaces', value: formatNumber(data.totals.applications), detail: `${formatNumber(data.totals.completedKits)} completed kits` },
          { label: 'Active paid accounts', value: formatNumber(data.totals.activePaid), detail: 'Current subscription snapshot' },
          { label: 'Generation failures', value: formatNumber(data.totals.failedGenerations), detailTone: data.totals.failedGenerations ? 'negative' : 'neutral', detail: adminRangeLabel(days) },
        ]}
      />
      <AdminSection title="Account and application activity" meta="UTC">
        <LineChart
          ariaLabel="Daily account and application activity"
          labels={accounts.labels}
          series={[
            { id: 'applications', name: 'Applications', values: applications.values, focal: true },
            { id: 'accounts', name: 'Accounts', values: accounts.values },
          ]}
        />
      </AdminSection>
      <AdminSection title="Applicant journey" meta="Current workspace snapshot">
        <ApplicantJourneyRail
          ariaLabel="Applicant journey"
          stages={[
            { id: 'workspace', label: 'Workspaces', value: formatNumber(journey.workspaces), rateToNext: formatPercent(journey.generated, journey.workspaces) },
            { id: 'generated', label: 'Generated', value: formatNumber(journey.generated), rateToNext: formatPercent(journey.applied, journey.generated) },
            { id: 'applied', label: 'Applied', value: formatNumber(journey.applied), rateToNext: formatPercent(journey.interviews, journey.applied) },
            { id: 'interview', label: 'Interview', value: formatNumber(journey.interviews), rateToNext: formatPercent(journey.accepted, journey.interviews) },
            { id: 'accepted', label: 'Accepted', value: formatNumber(journey.accepted) },
          ]}
        />
      </AdminSection>
      <AdminSection title="Needs attention" meta={`Updated ${formatDate(data.generatedAt)}`}>
        <DataTable
          caption="Recent application and job feed failures"
          getRowKey={(row) => `${row.kind}-${row.id}`}
          rows={data.recentFailures}
          columns={[
            { key: 'kind', header: 'Area', render: (row) => row.kind },
            { key: 'label', header: 'Item', render: (row) => row.label },
            { key: 'time', header: 'Occurred', render: (row) => formatDate(row.occurredAt) },
          ]}
          emptyState={<SourceState kind="empty" title="No recent failures" />}
        />
      </AdminSection>
    </div>
  );
}
