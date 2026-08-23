/**
 * The typed alternative to the setup chips: "US and Canada, remote, 150K+"
 * in one line. Only reports what it actually recognised, so the conversation
 * can ask for the rest instead of guessing.
 */

import { matchCountriesInText } from '@/lib/job-feed/constants';
import type { JobFeedSettingsInput } from '@/lib/job-feed/types';
import { readSalaryFloor } from '@/lib/job-feed/rerank-intent';

export interface SetupLineResult {
  countries: string[];
  remotePreference: JobFeedSettingsInput['remote_preference'] | null;
  salaryFloor: number | null;
}

export function parseSetupLine(text: string): SetupLineResult {
  const lower = ` ${text.toLowerCase().replace(/[,/]/g, ' ')} `;

  const countries = matchCountriesInText(text);

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
