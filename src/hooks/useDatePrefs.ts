'use client';

import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { datePrefsFrom, DEFAULT_DATE_PREFS, type DatePrefs } from '@/lib/utils/format-date';

/**
 * The reader's saved timezone and date order, for every component that prints a
 * date. Signed out, or before the profile lands, this is the neutral default.
 */
export function useDatePrefs(): DatePrefs {
  const { profile } = useAuth();
  const timezone = profile?.timezone ?? null;
  const dateFormat = profile?.date_format ?? null;
  return useMemo(
    () => (profile ? datePrefsFrom({ timezone, date_format: dateFormat }) : DEFAULT_DATE_PREFS),
    [profile, timezone, dateFormat],
  );
}
