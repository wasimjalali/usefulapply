/**
 * The chat tools can rewrite existing CV prose, but none can add a new claim
 * to the applicant's source documents. If the model offers that unsupported
 * action anyway, replace the whole reply before it reaches the client.
 */

const ADDITION_OFFER = /\b(?:want me to|would you like me to|should i|shall i|can i|i can|let me)\b(?:\s+\w+){0,5}\s+(?:add|include|insert)\b/i;
const PROMISED_INCLUSION = [
  /\b(?:version|rewrite|revision)\s+(?:with|including)\s+([^.!?\n]{1,180}?)\s+(?:will|should)\s+(?:appear|show\s+up|land|be\s+(?:ready|available))\b/i,
  /\b(?:version|rewrite|revision)\s+(?:will|should)\s+(?:include|add|contain|feature|place)\s+([^.!?\n]{1,180}?)(?=\s+(?:once|after|when)\b|[.!?\n]|$)/i,
  // The live model paraphrases freely ("the version that adds X and notes
  // Y"), so any rewrite noun followed by an adding verb counts as a promise.
  /\b(?:version|rewrite|revision)\b[^.!?\n]{0,60}?\b(?:adds?|includes?|including|inserts?|mentions?|notes?|features?|highlights?|incorporat(?:es?|ing))\s+([^.!?\n]{1,180}?)(?=\s+(?:once|after|when)\b|[.!?\n]|$)/i,
];
const CLAIM_LIKE_INCLUSION = /\b(?:certifications?|credentials?|employers?|compan(?:y|ies)|teams?|skills?|expertise|metrics?)\b|[\p{Nd}]/u;
const REWRITE_SHAPE = /\b[\p{Nd}]+\s+(?:(?:tighter|shorter|clearer|stronger|punchier|concise)\s+)?(?:bullets?|items?|sentences?|lines?|points?|paragraphs?|words?|sections?)\b/giu;
const REWRITE_STYLE = /\b(?:team|skills?|metrics?)-focused\s+(?:wording|tone|style)\b/giu;
const CV_DOCUMENT = /\b(?:cv|resume|résumé)\b/i;
const REWRITE_VERB = /\b(?:rewrite|reword|rephrase|revise|tighten|shorten)\b/i;
const CV_SECTION = /\b(?:bullets?|summary|section|experience|project description)\b/i;

export const UNSUPPORTED_CV_ADDITION_REPLY =
  'Unsupported claims stay out of your CV. I can only rewrite it using what is already in your documents.';

export function guardUnsupportedCvAdditionOffer(
  reply: string,
  options?: { cvRewriteProposed?: boolean },
): string {
  const promisedItems = options?.cvRewriteProposed
    ? PROMISED_INCLUSION
      .map((pattern) => reply.match(pattern)?.[1].trim())
      .find((items) => items && CLAIM_LIKE_INCLUSION.test(
        items.replace(REWRITE_SHAPE, ' ').replace(REWRITE_STYLE, ' '),
      ))
    : null;
  if (promisedItems) {
    const items = promisedItems;
    return `I can't add ${items} from this request. CV rewrites only use details supported by your documents.`;
  }

  const sentences = reply.split(/[.!?\n]+/u);
  const offered = sentences.some((sentence) =>
    ADDITION_OFFER.test(sentence)
    && (CV_DOCUMENT.test(sentence)
      || (REWRITE_VERB.test(sentence) && CV_SECTION.test(sentence))));
  return offered ? UNSUPPORTED_CV_ADDITION_REPLY : reply;
}
