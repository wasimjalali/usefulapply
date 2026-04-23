import { Suspense } from 'react';
import { SettingsScreen, SettingsScreenFallback } from '@/components/settings/SettingsScreen';

export default function AccountPage() {
  return (
    <Suspense fallback={<SettingsScreenFallback />}>
      <SettingsScreen forcedSection="account" />
    </Suspense>
  );
}
