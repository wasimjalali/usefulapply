import { Suspense } from 'react';
import { SettingsScreen, SettingsScreenFallback } from '@/components/settings/SettingsScreen';

export default function ProfilePage() {
  return (
    <Suspense fallback={<SettingsScreenFallback />}>
      <SettingsScreen forcedSection="profile" />
    </Suspense>
  );
}
