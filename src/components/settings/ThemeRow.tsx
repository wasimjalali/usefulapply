'use client';

import { useSyncExternalStore } from 'react';
import { Row, Select } from '@/components/settings/parts';
import { THEME_STORAGE_KEY, isThemePreference, readThemePreference, saveThemePreference, type ThemePreference } from '@/lib/theme';

const OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Re-read on this tab's own change (saveThemePreference fires `ua-theme-change`) and on another tab's. */
function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) onChange();
  };
  window.addEventListener('ua-theme-change', onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener('ua-theme-change', onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** System, Light or Dark for the app. Stored on this device (a cookie and localStorage), not on the account. */
export function ThemeRow() {
  const theme = useSyncExternalStore(subscribe, readThemePreference, () => 'system' as ThemePreference);

  return (
    <Row label="Theme">
      <Select
        label="Theme"
        value={theme}
        options={OPTIONS}
        onChange={(next) => {
          if (isThemePreference(next)) saveThemePreference(next);
        }}
      />
    </Row>
  );
}
