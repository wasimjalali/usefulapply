import { Suspense } from 'react';
import { SettingsScreen, SettingsScreenFallback } from '@/components/settings/SettingsScreen';

export default function SubscriptionPage() {
  return (
    <Suspense fallback={<SettingsScreenFallback />}>
      <SettingsScreen forcedSection="subscription" />
    </Suspense>
  );
}
