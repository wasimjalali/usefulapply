import { getAdminBilling } from '@/db/repos/admin-dashboard';
import { adminRangeLabel, parseAdminRange } from '@/lib/admin/range';
import { loadAdminPageData } from '@/lib/admin/page-access';
import { AdminPageHeader, AdminRangeLinks, AdminSection, DataTable, HorizontalBarList, MetricSurface, SourceState } from '../_components';
import { formatDate, formatDecimal, formatNumber, statusTone } from '../_lib/presentation';

type SearchParams = Promise<{ days?: string | string[] }>;

export default async function AdminBillingPage({ searchParams }: { searchParams: SearchParams }) {
  const days = parseAdminRange((await searchParams).days);
  const data = await loadAdminPageData(() => getAdminBilling(days));
  const availableCredits = data.totals.monthlyCredits + data.totals.rolloverCredits + data.totals.addonCredits;

  return (
    <div className="admin-page-stack">
      <AdminPageHeader
        title="Billing and credits"
        dateLabel={adminRangeLabel(days)}
        sourceStatus={{ label: 'D1 subscription snapshot', tone: 'available' }}
        actions={<AdminRangeLinks active={days} />}
      />
      <MetricSurface
        ariaLabel="Billing and credit metrics"
        metrics={[
          { label: 'Active paid accounts', value: formatNumber(data.totals.activePaid) },
          { label: 'Past due accounts', value: formatNumber(data.totals.pastDue), detailTone: data.totals.pastDue ? 'negative' : 'neutral' },
          { label: 'Available credits', value: formatDecimal(availableCredits), detail: 'Current balance snapshot' },
          { label: 'Credits spent', value: formatDecimal(data.totals.spentCredits), detail: adminRangeLabel(days) },
          { label: 'Realized revenue', value: 'Unavailable', detail: 'No Stripe billing source connected', detailTone: 'warning' },
        ]}
      />
      <AdminSection title="Subscription state" meta="Current D1 rows">
        <HorizontalBarList
          ariaLabel="Subscriptions by plan and status"
          data={data.plans.map((row) => ({ id: `${row.tier}-${row.status}`, label: `${row.tier} ${row.status}`, value: row.value, valueLabel: formatNumber(row.value), focal: row.status === 'active' && row.tier !== 'free' }))}
        />
      </AdminSection>
      <AdminSection title="Recent credit activity" meta="No customer or Stripe identifiers shown">
        <DataTable
          caption="Recent credit ledger activity"
          getRowKey={(row) => row.id}
          rows={data.activity}
          columns={[
            { key: 'kind', header: 'Type', render: (row) => <span className="admin-status" data-tone={statusTone(row.amount < 0 ? 'completed' : 'active')}>{row.kind.replaceAll('_', ' ')}</span> },
            { key: 'amount', header: 'Amount', align: 'right', render: (row) => `${row.amount > 0 ? '+' : ''}${formatDecimal(row.amount)}` },
            { key: 'time', header: 'Recorded', render: (row) => formatDate(row.createdAt) },
          ]}
          emptyState={<SourceState kind="empty" title="No credit activity found" />}
        />
      </AdminSection>
    </div>
  );
}
