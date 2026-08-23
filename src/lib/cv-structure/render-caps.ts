/**
 * What the templates actually put on the page, as opposed to what the object
 * holds.
 *
 * WHY THIS EXISTS. Every other check in this directory proves a property of the
 * CV OBJECT: content is conserved, no key outside the operation moved, no list
 * was emptied. All of that is true and none of it says anything about the
 * document the user downloads. The templates truncate skills while rendering:
 * every one of the six shows at most 5 items per skill group, and four of the
 * six show at most 5 groups. So a reorder that conserves every leaf string can
 * still push a skill group off the page and out of the PDF, and the object-level
 * checks pass in silence while the reply says "Moved Cloud to the top."
 *
 * This is the one place where "no operation changes content" is true of the
 * object and false of the document, so it gets its own check.
 *
 * THE CAPS ARE COPIED, NOT DERIVED. They mirror literal `.slice()` calls in the
 * template components, which are client components the Worker cannot import.
 * Changing a template's slice means changing this file in the same commit:
 *
 *   premium-ats          USPremiumATSTemplate.tsx:263 (0,2) + :350 (2,5), items :278/:365 (0,5)
 *   executive            USProfessionalTemplate.tsx:209 (0,2) + :296 (2,5), items :224/:311 (0,5)
 *   classic-green        ClassicGreenTemplate.tsx:235 (0,2) + :322 (2,5), items :250/:337 (0,5)
 *   german-classic       GermanClassicTemplate.tsx:271 (0,5), items :286 (0,5)
 *   modern-professional  USModernATSTemplate.tsx:213 (no group cap), items :226 (0,5)
 *   german-ats           GermanATSTemplate.tsx:261 (no group cap), items :274 (0,5)
 *
 * Every id outside that list, including the legacy ids, falls through
 * CVTemplateRenderer to USPremiumATSTemplate or USProfessionalTemplate, both of
 * which cap groups at 5. So 5 is the right default for an unknown id.
 *
 * JUDGED AGAINST THE TEMPLATE IN USE, not against the tightest of the six. A
 * warning that names a group which is in fact on the page is a warning the user
 * learns to ignore, and that costs more than it buys. The known gap: switching
 * from german-ats to premium-ats later can hide a group that this check passed,
 * and nothing warns at that point. Moving the caps into the template
 * definitions and checking on template switch is the real fix.
 */

import type { TailoredCV } from './types';

/** Every template renders at most this many items inside one skill group. */
const SKILL_ITEM_CAP = 5;

/** Templates that render every skill group. Everything else stops at 5. */
const UNCAPPED_GROUP_TEMPLATES = new Set(['modern-professional', 'german-ats']);

const SKILL_GROUP_CAP = 5;

function groupCap(templateId: string | null | undefined): number {
  return templateId && UNCAPPED_GROUP_TEMPLATES.has(templateId)
    ? Number.POSITIVE_INFINITY
    : SKILL_GROUP_CAP;
}

interface VisibleEntry {
  kind: 'group' | 'item';
  category: string;
  /** The skill text, for an item. Empty for a group. */
  item: string;
  count: number;
}

/**
 * A map key built from two free-text fields, so it needs a separator neither
 * one can contain. NUL cannot survive JSON parsing into the CV.
 */
function entryKey(kind: string, category: string, item: string): string {
  return [kind, category, item].join('\u0000');
}

/**
 * The skills text this template actually paints, as a multiset.
 *
 * Keyed by text rather than by position, so a pure reorder that keeps the same
 * entries on the page compares equal, which is the whole point: a move that
 * changes nothing visible must not raise a warning.
 */
function visibleSkills(
  cv: TailoredCV,
  templateId: string | null | undefined,
): Map<string, VisibleEntry> {
  const seen = new Map<string, VisibleEntry>();
  const bump = (kind: 'group' | 'item', category: string, item: string) => {
    const key = entryKey(kind, category, item);
    const existing = seen.get(key);
    if (existing) existing.count += 1;
    else seen.set(key, { kind, category, item, count: 1 });
  };
  for (const group of (cv.skills ?? []).slice(0, groupCap(templateId))) {
    if (!group || typeof group !== 'object') continue;
    const category = String(group.category ?? '');
    bump('group', category, '');
    for (const item of (Array.isArray(group.items) ? group.items : []).slice(0, SKILL_ITEM_CAP)) {
      bump('item', category, String(item));
    }
  }
  return seen;
}

/**
 * The readable name behind one entry. This is the user's own CV text going back
 * into a reply, so it is flattened, capped and wrapped in the same << >> the
 * outline labels use, which the prompt already tells the model to relay rather
 * than read.
 */
function readable(entry: VisibleEntry): string {
  const text = entry.kind === 'group'
    ? entry.category
    : `${entry.item} (in ${entry.category})`;
  const clean = text
    .replace(/[\u0000-\u001F\u007F<>]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const capped = clean.length > 60 ? `${clean.slice(0, 60)}...` : clean;
  return `<<${capped || 'untitled'}>>`;
}

export interface RenderVisibility {
  /** Entries the page showed before and does not show after. Empty when none. */
  droppedFromPage: string[];
  /** True when the page shows exactly what it showed before. */
  pageUnchanged: boolean;
}

/** Does the CV still hold this entry somewhere, painted or not? */
function stillInObject(cv: TailoredCV, entry: VisibleEntry): boolean {
  for (const group of cv.skills ?? []) {
    if (!group || typeof group !== 'object') continue;
    if (String(group.category ?? '') !== entry.category) continue;
    if (entry.kind === 'group') return true;
    if (Array.isArray(group.items) && group.items.some((value) => String(value) === entry.item)) {
      return true;
    }
  }
  return false;
}

/**
 * What this edit did to the rendered page, as opposed to the object.
 *
 * Only skills can change here: no template truncates any other list, so a
 * reorder or delete anywhere else always shows up on the page in full.
 */
export function renderVisibility(
  before: TailoredCV,
  after: TailoredCV,
  templateId: string | null | undefined,
): RenderVisibility {
  const was = visibleSkills(before, templateId);
  const now = visibleSkills(after, templateId);

  const droppedFromPage: string[] = [];
  let pageUnchanged = was.size === now.size;

  for (const [key, entry] of was) {
    const remaining = now.get(key)?.count ?? 0;
    if (remaining === entry.count) continue;
    pageUnchanged = false;
    if (remaining > entry.count) continue;
    // Content the edit was allowed to DELETE is not in `after` at all, so it
    // never lands here. What lands here is content the object still holds and
    // the page has stopped showing, which is the silent loss.
    if (stillInObject(after, entry)) droppedFromPage.push(readable(entry));
  }
  if (pageUnchanged) {
    for (const key of now.keys()) {
      if (!was.has(key)) {
        pageUnchanged = false;
        break;
      }
    }
  }

  return { droppedFromPage, pageUnchanged };
}
