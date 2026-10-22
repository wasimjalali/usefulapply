/**
 * Effort per Haiku call site. One fixed value per site, never varied per request (the evals pick it).
 * 'low-nothink' = effort low with thinking disabled (callHaiku sends `thinking: {type: 'disabled'}`).
 * Note: `disabled` is a different cache key for everything on Haiku 5.5, so a 'low-nothink' site
 * shares no cached prefix with an adaptive-thinking site.
 *
 * HAIKU_EFFORT_<SITE> (upper case, for example HAIKU_EFFORT_CHAT, HAIKU_EFFORT_SEARCH_STRATEGY)
 * overrides a site's value so evals can run against the real routes. Production ships with none set.
 * An invalid value throws.
 */
import type { HaikuEffort, HaikuSite } from './haiku';

export const HAIKU_EFFORTS: readonly HaikuEffort[] = ['low-nothink', 'low', 'medium', 'high'];

// Picked by the effort eval of 2026-10-22 (evals/results/2026-10-22-haiku-55-swap.md): the lowest effort
// within one failure of the best arm, with the hard constraints checked. Medium where thinking bought
// fewer invented claims or rule violations (tracker, screening, ranking, career profile).
export const HAIKU_SITE_EFFORT: Readonly<Record<HaikuSite, HaikuEffort>> = {
  chat: 'low',
  screening: 'medium',
  tracker: 'medium',
  language: 'low',
  ranking: 'medium',
  search_strategy: 'low',
  career_profile: 'medium',
};

export function haikuEffortEnvName(site: HaikuSite): string {
  return `HAIKU_EFFORT_${site.toUpperCase()}`;
}

export function isHaikuEffort(value: unknown): value is HaikuEffort {
  return typeof value === 'string' && (HAIKU_EFFORTS as readonly string[]).includes(value);
}

export function resolveHaikuEffort(
  site: HaikuSite,
  env: Record<string, string | undefined> = process.env,
): HaikuEffort {
  const name = haikuEffortEnvName(site);
  const override = env[name];
  if (override === undefined) {
    const configured = HAIKU_SITE_EFFORT[site];
    if (!configured) throw new Error(`No Haiku effort configured for site "${site}"`);
    return configured;
  }
  if (!isHaikuEffort(override)) {
    throw new Error(`${name}="${override}" is not a valid effort. Use one of: ${HAIKU_EFFORTS.join(', ')}`);
  }
  return override;
}
