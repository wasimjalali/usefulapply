'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { THEME_STORAGE_KEY, applyTheme, readThemePreference } from '@/lib/theme';

/**
 * Keeps `data-theme` right after the first paint: on client-side navigation between a light page (landing) and a
 * themed one (dashboard), and when another tab changes the setting.
 */
export function ThemeController() {
  const pathname = usePathname();

  useEffect(() => {
    applyTheme(readThemePreference(), pathname);
  }, [pathname]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) applyTheme(readThemePreference(), window.location.pathname);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return null;
}
