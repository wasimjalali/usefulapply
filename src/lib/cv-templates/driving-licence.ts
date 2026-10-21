/**
 * A driving licence has one place in the CV data, `personal.driverLicense`, and
 * one printed line. The writer sometimes also keeps the source line ("Driving
 * licence: Class B") in additionalInfo, and every renderer that adds a licence
 * line of its own has to see that and stay quiet. Everything that adds, checks
 * or removes a licence line goes through this one word list.
 */

// English (licence, license, driving, driver's), German, French, Spanish, Italian, Dutch.
const DRIVING_LICENCE = /licen[cs]e|driving|driver|führerschein|fuhrerschein|fuehrerschein|fahrerlaubnis|permis de conduire|carnet de conducir|patente|rijbewijs/i;

/** True when the text states a driving licence, in any of the spellings above. */
export function mentionsDrivingLicence(text: string): boolean {
  return DRIVING_LICENCE.test(text);
}

/** True when any item of the list states a driving licence. */
export function listMentionsDrivingLicence(items: readonly string[] | undefined): boolean {
  return (items ?? []).some(mentionsDrivingLicence);
}

/**
 * additionalInfo with the licence printed once. The licence line is added only
 * when no item states one already; `line` is the wording to add.
 */
export function withDrivingLicenceLine(items: readonly string[] | undefined, driverLicense: string | undefined, line: string): string[] | undefined {
  if (!driverLicense?.trim() || listMentionsDrivingLicence(items)) return items ? [...items] : undefined;
  return [...(items ?? []), line];
}

// Facts joined in one item ("Valid permit • Driving licence: B") split on these.
const ITEM_SEPARATOR = /\s*[•|;·]\s*/;
// "Full clean UK driving licence (Class B)" is 7 words; anything longer is a sentence with other facts.
const MAX_LICENCE_STATEMENT_WORDS = 8;

/**
 * Removes the driving-licence statements from additionalInfo once the licence
 * has its own field. An item that holds other facts too keeps them, when they
 * are separated by a bullet, bar or semicolon; otherwise the whole item stays
 * and the renderers add no second line. Without `driverLicense` nothing changes.
 */
export function dropRestatedDrivingLicence(items: string[] | undefined, driverLicense: string | undefined): string[] | undefined {
  if (!items || !driverLicense?.trim()) return items;
  const kept: string[] = [];
  for (const item of items) {
    if (!mentionsDrivingLicence(item)) {
      kept.push(item);
      continue;
    }
    const parts = item.split(ITEM_SEPARATOR).filter((part) => part.trim());
    const rest = parts.filter((part) => !mentionsDrivingLicence(part));
    if (rest.length > 0) kept.push(rest.length < parts.length ? rest.join(' • ') : item);
    // A long single sentence with the licence mixed into other facts isn't separable: keep it whole.
    else if (parts.length === 1 && item.trim().split(/\s+/).length > MAX_LICENCE_STATEMENT_WORDS) kept.push(item);
  }
  return kept.length > 0 ? kept : undefined;
}
