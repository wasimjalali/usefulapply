/**
 * The three mechanical operations. Pure functions: a CV in, a CV out, no
 * store, no database, no React. Server and client both import them, so the two
 * cannot disagree about what an operation means.
 *
 * WHY REORDER AND NOT MOVE. A full ordering can be checked as a permutation of
 * the element references already in the list, so reorder is structurally
 * incapable of adding, dropping, duplicating or rewording anything, whatever
 * payload the model sends. It never reads text out of the arguments: it reads
 * handles, maps them to positions, and rebuilds the array from the objects that
 * were already there. A bad handle list is a refusal, never a partial edit.
 * "Move the AWS cert higher" is one reorder of certifications.
 *
 * None of these operations takes a content parameter. There is nowhere for
 * prose to enter. rename_heading takes a heading, and that heading has to be a
 * member of a closed per-CV enum before it is applied.
 */

import { handleRefusal, listHandles, listRefusal, readList, resolveHandle, writeList } from './handles';
import { leafMultiset } from './validate';
import type { ListHandle, OpResult, TailoredCV } from './types';

/**
 * Reorder one list into the order given.
 *
 * `order` must be a permutation of the list's current handles: same length,
 * every handle present, none repeated. Anything else refuses.
 */
export function applyReorder(cv: TailoredCV, list: string, order: unknown): OpResult {
  const items = readList(cv, list);
  if (!items) {
    // A well-formed handle whose parent key matches two parents gets its own
    // sentence, because "not a list on this CV" would send the user hunting
    // for a typo in a handle that is perfectly correct.
    return {
      ok: false,
      error: listRefusal(cv, list)
        ?? 'That is not a list I can reorder on this CV. Read the outline again and use one of its list names.',
    };
  }
  if (!Array.isArray(order) || order.some((handle) => typeof handle !== 'string')) {
    return { ok: false, error: 'The new order has to be the list of handles from the outline.' };
  }
  const handles = listHandles(cv, list);
  if (!handles) {
    return { ok: false, error: 'That list is not addressable on this CV.' };
  }
  if (handles.some((entry) => entry.ambiguous)) {
    return {
      ok: false,
      error: 'Two entries in that list read exactly the same, so I cannot tell them apart to move them. Change the wording of one of them in the CV canvas first.',
    };
  }
  if (items.length < 2) {
    return { ok: false, error: 'There is only one entry there, so there is nothing to reorder.' };
  }
  if (order.length !== items.length) {
    return {
      ok: false,
      error: `The new order has to list all ${items.length} entries exactly once. Read the outline again and send the full list.`,
    };
  }

  const positionByHandle = new Map(handles.map((entry, index) => [entry.handle, index]));
  const used = new Set<string>();
  const next: unknown[] = [];
  for (const handle of order as string[]) {
    const position = positionByHandle.get(handle);
    if (position === undefined) {
      return { ok: false, error: 'One of those handles is not in that list any more. Read the outline again.' };
    }
    if (used.has(handle)) {
      return { ok: false, error: 'That order lists the same entry twice. Each entry appears exactly once.' };
    }
    used.add(handle);
    // The element itself, by reference. Nothing in the payload becomes content.
    next.push(items[position]);
  }

  const updated = writeList(cv, list, next);
  if (!updated) {
    return { ok: false, error: 'That list could not be written back. Nothing was changed.' };
  }
  return { ok: true, cv: updated };
}

/** Delete one item. The caller validates; this only builds the candidate object. */
export function applyDelete(
  cv: TailoredCV,
  handle: string,
): (OpResult & { ok: true; removed: string[] }) | { ok: false; error: string } {
  const resolved = resolveHandle(cv, handle);
  if (!resolved) {
    return {
      ok: false,
      error: handleRefusal(cv, handle)
        ?? 'I cannot find that entry on the CV any more. Read the outline again and point at it from there.',
    };
  }
  const items = readList(cv, resolved.list);
  if (!items) {
    return { ok: false, error: 'That entry is not on the CV any more.' };
  }
  const target = items[resolved.index];
  const next = items.slice();
  next.splice(resolved.index, 1);
  const updated = writeList(cv, resolved.list, next);
  if (!updated) {
    return { ok: false, error: 'That entry could not be removed. Nothing was changed.' };
  }
  // Exactly the leaves the delete is allowed to drop. assertConserved holds the
  // result to this list and nothing else.
  const removed: string[] = [];
  for (const [leaf, count] of leafMultiset(target)) {
    for (let i = 0; i < count; i += 1) removed.push(leaf);
  }
  return { ok: true, cv: updated, removed };
}

/**
 * Rename one section heading.
 *
 * `allowed` is the closed enum for this section in this CV's language, built by
 * headingOptions(). A heading outside it is refused and the caller names the
 * nearest allowed ones. This is the only operation that writes any text at all,
 * and it can only write a string that was already in that list.
 *
 * `currentEffective` is the heading the page shows TODAY, which is not the same
 * as the stored one: a section with nothing in sectionHeaders renders the
 * localized default. Renaming to that default would write a key, pass
 * conservation (one string added, none removed), ship an effect and raise an
 * Undo chip for a page that did not change. The caller has the effective
 * heading from currentHeading(), so it passes it in and this refuses the no-op.
 *
 * Two headings come back on success and they are not interchangeable:
 *   `from`      the STORED value, or '' when nothing was stored. This is the
 *               conservation contract: it is the only string actually leaving
 *               the object, so it is what the caller may list as removed.
 *   `fromLabel` what the user saw. This is what the reply says.
 */
export function applyRenameHeading(
  cv: TailoredCV,
  sectionKey: string,
  heading: unknown,
  allowed: string[],
  currentEffective: string,
): (OpResult & { ok: true; from: string; fromLabel: string; to: string }) | { ok: false; error: string } {
  if (typeof heading !== 'string' || !heading.trim()) {
    return { ok: false, error: 'That heading is empty. Pick one from renameable_as in the outline.' };
  }
  const wanted = heading.trim().toUpperCase();
  const match = allowed.find((option) => option.toUpperCase() === wanted);
  if (!match) {
    const nearest = allowed.slice(0, 6).join(', ');
    return {
      ok: false,
      error: nearest
        ? `That heading is not one this CV can use. The options for that section are: ${nearest}.`
        : 'That section has no other heading to switch to on this CV.',
    };
  }
  if (currentEffective.trim().toUpperCase() === wanted) {
    return { ok: false, error: 'That section is already called that, so there is nothing to change.' };
  }
  const from = cv.sectionHeaders?.[sectionKey as keyof NonNullable<TailoredCV['sectionHeaders']>] ?? '';
  const updated: TailoredCV = {
    ...cv,
    sectionHeaders: { ...(cv.sectionHeaders ?? {}), [sectionKey]: match },
  };
  return { ok: true, cv: updated, from, fromLabel: currentEffective, to: match };
}

/** Every list handle this CV currently has, for validating a list argument. */
export function isListOnCv(cv: TailoredCV, list: string): list is ListHandle {
  return readList(cv, list) !== null;
}
