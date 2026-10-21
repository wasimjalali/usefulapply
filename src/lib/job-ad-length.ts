/**
 * How long a pasted message must be before the chat treats it as a job ad. One place, so the chat panel and
 * the e2e spec use the same numbers and the same words.
 */

/** Below this a message is a question, whatever the model called it. Same floor as the hero box and the guided line. */
export const MIN_JOB_AD_CHARS = 80;
/** From here a posting is long enough that the match is not hedged with a "looks short" hint. */
export const SHORT_JOB_AD_CHARS = 200;

/** Shown on the decision card for a posting between the two thresholds. */
export const SHORT_JOB_AD_HINT = 'This looks short. Add more of the posting for a better match.';
/** Appended to the model's own reply when it called a message under the floor a job ad. */
export const TOO_SHORT_JOB_AD_NOTE = 'If that was a job ad, paste the whole posting.';

/** Too short to be a posting at all: the proposal is ignored. */
export const isTooShortJobAd = (text: string): boolean => text.trim().length < MIN_JOB_AD_CHARS;
/** A posting, but a short one: the card says so. */
export const isShortJobAd = (text: string): boolean => {
  const length = text.trim().length;
  return length >= MIN_JOB_AD_CHARS && length < SHORT_JOB_AD_CHARS;
};
