import { Suspense } from 'react';
import { SettingsScreen, SettingsScreenFallback } from '@/components/settings/SettingsScreen';

export default function NotificationsPage() {
  return (
    <Suspense fallback={<SettingsScreenFallback />}>
      <SettingsScreen forcedSection="notifications" />
    </Suspense>
  );
}
