import { getAdminAiUsage } from '@/db/repos/admin-dashboard';
import { adminRangeLabel, parseAdminRange } from '@/lib/admin/range';
import { loadAdminPageData } from '@/lib/admin/page-access';
import { AdminPageHeader, AdminRangeLinks, AdminSection, DataTable, HorizontalBarList, MetricSurface, SourceState } from '../_components';
import { formatDate, formatNumber } from '../_lib/presentation';

type SearchParams = Promise<{ days?: string | string[] }>;

export default async function AdminAiCostsPage({ searchParams }: { searchParams: SearchParams }) {
  const days = parseAdminRange((await searchParams).days);
  const data = await loadAdminPageData(() => getAdminAiUsage(days));
  const hasLedgerData = data.trackingStartedAt !== null;
  const exactTokens = data.summary.totalTokens;
  const hasCoverageGaps = data.summary.missingUsage > 0 || data.summary.staleStarted > 0;
  const coverageComplete = data.coverage === 'complete' && !hasCoverageGaps;

  return (
    <div className="admin-page-stack">
      <AdminPageHeader
        title="AI and costs"
        dateLabel={adminRangeLabel(days)}
        sourceStatus={{ label: coverageComplete ? 'Provider usage exact' : `Provider usage ${data.coverage === 'complete' ? 'partial' : data.coverage}`, tone: coverageComplete ? 'available' : 'partial' }}
        actions={<AdminRangeLinks active={days} />}
      />
      <MetricSurface
        ariaLabel="AI usage metrics"
        metrics={[
          { label: 'Input and output tokens', value: exactTokens === null ? 'Unavailable' : formatNumber(exactTokens), detail: coverageComplete ? 'Provider-reported only' : 'Exact inside a partial tracking window', detailTone: coverageComplete ? 'neutral' : 'warning' },
          { label: 'Cache read tokens', value: data.summary.cacheReadTokens === null ? 'Unavailable' : formatNumber(data.summary.cacheReadTokens), detail: coverageComplete ? undefined : 'Partial tracking window', detailTone: coverageComplete ? 'neutral' : 'warning' },
          { label: 'Responses', value: data.coverage === 'unavailable' ? 'Unavailable' : formatNumber(data.summary.responses), detail: `${formatNumber(data.summary.reported)} with complete token usage` },
          { label: 'Failed calls', value: data.coverage === 'unavailable' ? 'Unavailable' : formatNumber(data.summary.failures), detailTone: data.summary.failures ? 'negative' : data.coverage === 'complete' ? 'neutral' : 'warning' },
          { label: 'Billed cost', value: 'Unavailable', detail: 'No provider billing source connected', detailTone: 'warning' },
        ]}
      />
      {hasCoverageGaps ? (
        <SourceState kind="unavailable" title="Usage coverage has gaps" message={`${formatNumber(data.summary.missingUsage)} responses lacked provider usage. ${formatNumber(data.summary.staleStarted)} started calls have no terminal record.`} />
      ) : null}
      {!hasLedgerData ? <SourceState kind="empty" title="No provider usage recorded yet" /> : null}
      <AdminSection title="Tokens by feature" meta="Exact provider-reported totals">
        <HorizontalBarList
          ariaLabel="Token usage by feature"
          data={data.features.map((row) => ({ id: row.feature, label: row.feature, value: row.tokens ?? 0, valueLabel: row.tokens === null ? 'Unavailable' : formatNumber(row.tokens), focal: row.feature === 'application' }))}
        />
      </AdminSection>
      <AdminSection title="Model usage" meta={data.trackingStartedAt ? `Tracked since ${formatDate(data.trackingStartedAt)}` : undefined}>
        <DataTable
          caption="LLM usage by provider and model"
          getRowKey={(row) => `${row.provider}-${row.model}`}
          rows={data.models}
          columns={[
            { key: 'provider', header: 'Provider', render: (row) => row.provider },
            { key: 'model', header: 'Model', render: (row) => <span className="admin-mono">{row.model}</span> },
            { key: 'calls', header: 'Calls', align: 'right', render: (row) => formatNumber(row.calls) },
            { key: 'tokens', header: 'Tokens', align: 'right', render: (row) => row.tokens === null ? 'Unavailable' : formatNumber(row.tokens) },
            { key: 'cost', header: 'Billed cost', align: 'right', render: () => 'Unavailable' },
          ]}
          emptyState={<SourceState kind="empty" title="No model usage found" />}
        />
      </AdminSection>
    </div>
  );
}
