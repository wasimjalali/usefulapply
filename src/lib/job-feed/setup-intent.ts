/**
 * The typed alternative to the setup chips: "US and Canada, remote, 150K+"
 * in one line. Only reports what it actually recognised, so the conversation
 * can ask for the rest instead of guessing.
 */

import { JOB_FEED_COUNTRY_OPTIONS } from '@/lib/job-feed/constants';
import type { JobFeedSettingsInput } from '@/lib/job-feed/types';
import { readSalaryFloor } from '@/lib/job-feed/rerank-intent';

export interface SetupLineResult {
  countries: string[];
  remotePreference: JobFeedSettingsInput['remote_preference'] | null;
  salaryFloor: number | null;
}

/** Short forms boards and people actually use, on top of the full names. */
const COUNTRY_ALIASES: Record<string, string> = {
  us: 'us',
  usa: 'us',
  'u.s.': 'us',
  'u.s.a.': 'us',
  america: 'us',
  states: 'us',
  uk: 'gb',
  'u.k.': 'gb',
  britain: 'gb',
  england: 'gb',
  canada: 'ca',
  germany: 'de',
  deutschland: 'de',
  netherlands: 'nl',
  holland: 'nl',
  ireland: 'ie',
  france: 'fr',
  spain: 'es',
  italy: 'it',
  switzerland: 'ch',
  austria: 'at',
  belgium: 'be',
  denmark: 'dk',
  sweden: 'se',
  norway: 'no',
  finland: 'fi',
  poland: 'pl',
  australia: 'au',
  'new zealand': 'nz',
  india: 'in',
  singapore: 'sg',
  uae: 'ae',
};

export function parseSetupLine(text: string): SetupLineResult {
  const lower = ` ${text.toLowerCase().replace(/[,/]/g, ' ')} `;

  const countries: string[] = [];
  const push = (code: string) => {
    if (!countries.includes(code)) countries.push(code);
  };

  for (const option of JOB_FEED_COUNTRY_OPTIONS) {
    if (lower.includes(` ${option.label.toLowerCase()} `)) push(option.value);
  }
  for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) {
    if (lower.includes(` ${alias} `)) push(code);
  }

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
    remotePreference,
    salaryFloor: readSalaryFloor(text),
  };
}
