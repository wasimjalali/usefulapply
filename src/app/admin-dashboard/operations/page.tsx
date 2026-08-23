import { getAdminOperations } from '@/db/repos/admin-dashboard';
import { adminRangeLabel, parseAdminRange } from '@/lib/admin/range';
import { loadAdminPageData } from '@/lib/admin/page-access';
import { AdminPageHeader, AdminRangeLinks, AdminSection, DataTable, MetricSurface, SourceState } from '../_components';
import { formatDate, formatNumber, statusTone } from '../_lib/presentation';

type SearchParams = Promise<{ days?: string | string[] }>;

export default async function AdminOperationsPage({ searchParams }: { searchParams: SearchParams }) {
  const days = parseAdminRange((await searchParams).days);
  const data = await loadAdminPageData(() => getAdminOperations(days));
  const needsAttention = data.totals.failedFeedRuns + data.totals.stuckFeedRuns + data.totals.appFailures + data.totals.llmFailures + data.totals.staleLlm;

  return (
    <div className="admin-page-stack">
      <AdminPageHeader
        title="Operations"
        dateLabel={adminRangeLabel(days)}
        sourceStatus={{ label: needsAttention || data.llmCoverage !== 'complete' ? 'Attention needed' : 'Operational data live', tone: needsAttention || data.llmCoverage !== 'complete' ? 'partial' : 'available' }}
        actions={<AdminRangeLinks active={days} />}
      />
      <MetricSurface
        ariaLabel="Operational metrics"
        metrics={[
          { label: 'Job feed runs', value: formatNumber(data.totals.feedRuns) },
          { label: 'Failed feed runs', value: formatNumber(data.totals.failedFeedRuns), detailTone: data.totals.failedFeedRuns ? 'negative' : 'neutral' },
          { label: 'Stuck feed runs', value: formatNumber(data.totals.stuckFeedRuns), detail: 'Over 30 minutes', detailTone: data.totals.stuckFeedRuns ? 'warning' : 'neutral' },
          { label: 'Application failures', value: formatNumber(data.totals.appFailures), detailTone: data.totals.appFailures ? 'negative' : 'neutral' },
          { label: 'LLM ledger gaps', value: data.llmCoverage === 'unavailable' ? 'Unavailable' : formatNumber(data.totals.staleLlm), detail: data.llmCoverage === 'complete' ? 'Started over 10 minutes ago' : `Partial since ${formatDate(data.llmTrackingStartedAt)}`, detailTone: data.llmCoverage === 'complete' && !data.totals.staleLlm ? 'neutral' : 'warning' },
        ]}
      />
      <AdminSection title="Recent job feed runs">
        <DataTable
          caption="Recent job feed runs"
          getRowKey={(row) => row.id}
          rows={data.recentFeedRuns}
          columns={[
            { key: 'status', header: 'Status', render: (row) => <span className="admin-status" data-tone={statusTone(row.status)}>{row.status}</span> },
            { key: 'trigger', header: 'Trigger', render: (row) => row.triggerSource },
            { key: 'raw', header: 'Fetched', align: 'right', render: (row) => formatNumber(row.rawJobs) },
            { key: 'ranked', header: 'Ranked', align: 'right', render: (row) => formatNumber(row.rankedJobs) },
            { key: 'created', header: 'Created', render: (row) => formatDate(row.createdAt) },
          ]}
          emptyState={<SourceState kind="empty" title="No feed runs found" />}
        />
      </AdminSection>
      <AdminSection title="Recent provider failures" meta="Sanitized error categories only">
        <DataTable
          caption="Recent LLM provider failures"
          getRowKey={(row) => row.id}
          rows={data.recentLlmFailures}
          columns={[
            { key: 'feature', header: 'Feature', render: (row) => row.feature },
            { key: 'operation', header: 'Operation', render: (row) => row.operation },
            { key: 'provider', header: 'Provider', render: (row) => row.provider },
            { key: 'model', header: 'Model', render: (row) => <span className="admin-mono">{row.model}</span> },
            { key: 'error', header: 'Error', render: (row) => row.errorKind ?? 'Unclassified' },
            { key: 'time', header: 'Occurred', render: (row) => formatDate(row.occurredAt) },
          ]}
          emptyState={<SourceState kind="empty" title="No provider failures found" />}
        />
      </AdminSection>
    </div>
  );
}
