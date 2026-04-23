import { Suspense } from 'react';
import { SettingsScreen, SettingsScreenFallback } from '@/components/settings/SettingsScreen';

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsScreenFallback />}>
      <SettingsScreen />
    </Suspense>
  );
}
