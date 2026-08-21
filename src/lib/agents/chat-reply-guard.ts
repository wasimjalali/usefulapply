/**
 * The chat tools can rewrite existing CV prose, but none can add a new claim
 * to the applicant's source documents. If the model offers that unsupported
 * action anyway, replace the whole reply before it reaches the client.
 */

const ADDITION_OFFER = /\b(?:want me to|would you like me to|should i|shall i|can i|i can|let me)\b(?:\s+\w+){0,5}\s+(?:add|include|insert)\b/i;
const CV_DOCUMENT = /\b(?:cv|resume|résumé)\b/i;
const REWRITE_VERB = /\b(?:rewrite|reword|rephrase|revise|tighten|shorten)\b/i;
const CV_SECTION = /\b(?:bullets?|summary|section|experience|project description)\b/i;

export const UNSUPPORTED_CV_ADDITION_REPLY =
  'Unsupported claims stay out of your CV. I can only rewrite it using what is already in your documents.';

export function guardUnsupportedCvAdditionOffer(reply: string): string {
  const sentences = reply.split(/[.!?\n]+/u);
  const offered = sentences.some((sentence) =>
    ADDITION_OFFER.test(sentence)
    && (CV_DOCUMENT.test(sentence)
      || (REWRITE_VERB.test(sentence) && CV_SECTION.test(sentence))));
  return offered ? UNSUPPORTED_CV_ADDITION_REPLY : reply;
}
