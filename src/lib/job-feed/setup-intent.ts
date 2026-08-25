/**
 * The typed alternative to the setup chips on country and city steps.
 * Only reports what it actually recognised. Unknown names stay unknown.
 */

import { matchCitiesInText, matchCountriesInText } from '@/lib/job-feed/constants';
import type { JobFeedSettingsInput } from '@/lib/job-feed/types';
import { readSalaryFloor } from '@/lib/job-feed/rerank-intent';

export interface SetupLineResult {
  countries: string[];
  cities: string[];
  remotePreference: JobFeedSettingsInput['remote_preference'] | null;
  salaryFloor: number | null;
}

export function parseSetupLine(text: string): SetupLineResult {
  const lower = ` ${text.toLowerCase().replace(/[,/]/g, ' ')} `;

  const countries = matchCountriesInText(text);
  const cities = matchCitiesInText(text);

  let remotePreference: SetupLineResult['remotePreference'] = null;
  if (/\b(remote only|only remote|fully remote)\b/.test(lower)) {
    remotePreference = 'remote_only';
  } else if (/\bremote\b/.test(lower)) {
    remotePreference = 'remote_first';
  } else if (/\bhybrid\b/.test(lower)) {
    remotePreference = 'hybrid';
  } else if (/\b(on-?site|office|in person)\b/.test(lower)) {
    remotePreference = 'onsite';
  }

  return {
    countries,
    cities,
    remotePreference,
    salaryFloor: readSalaryFloor(text),
  };
}
