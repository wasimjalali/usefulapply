import { permanentRedirect } from 'next/navigation';

// Stripe checkout still returns to /subscription, so the success flags ride
// along to the Usage pane, which polls until the webhook lands.
export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams({ settings: 'usage' });
  for (const key of ['success', 'addon_success', 'canceled', 'addon_canceled']) {
    const value = params[key];
    if (typeof value === 'string') query.set(key, value);
  }
  permanentRedirect(`/dashboard?${query.toString()}`);
}
