import { permanentRedirect } from 'next/navigation';

// Older checkout links still return here. New ones go straight to
// /dashboard?settings=usage. The flags ride along either way so the Usage
// pane can poll until the webhook lands.
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
