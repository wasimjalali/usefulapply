/**
 * Parses the screening-answer reply format from /api/chat:
 *   ---ANSWER_START---
 *   **Q: question**
 *   answer
 *   ---ANSWER_END---
 */

/**
 * Screening turns per application. The chat route is what enforces it, against
 * `application_sessions.screening_turns_used`, which only that route writes.
 * The client reads this number to say how many are left; it is not the cap.
 */
export const SCREENING_TURN_CAP = 5;

export interface ParsedScreeningAnswer {
  question: string;
  answer: string;
  raw: string;
}

export function parseScreeningAnswers(content: string): ParsedScreeningAnswer[] | null {
  if (!content.includes('---ANSWER_START---')) return null;

  const blocks = content.split('---ANSWER_START---').filter(Boolean);
  const answers: ParsedScreeningAnswer[] = [];

  for (const block of blocks) {
    const cleaned = block.split('---ANSWER_END---')[0]?.trim();
    if (!cleaned) continue;

    // Extract question from **Q: ...** line
    const questionMatch = cleaned.match(/\*\*Q:\s*(.+?)\*\*/);
    const question = questionMatch ? questionMatch[1].trim() : '';

    // Answer is everything after the Q line
    const answerStart = cleaned.indexOf('**\n');
    const answer = answerStart !== -1
      ? cleaned.substring(answerStart + 3).trim()
      : cleaned.replace(/\*\*Q:.*?\*\*/, '').trim();

    if (answer) {
      answers.push({ question, answer, raw: cleaned });
    }
  }

  return answers.length > 0 ? answers : null;
}

/**
 * A composer message that reads like a screening-form question once a kit
 * exists: the openers recruiters use, addressed to the applicant. Questions
 * about the kit itself ("what did you change?", "is this good enough?") and
 * anything naming the kit's own documents stay in the chat. The explicit
 * "Answer screening questions" chip still works for anything this misses.
 */
export function looksLikeScreeningQuestion(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return false;
  if (/\b(cover letter|cv|resume|résumé|e-?mail|kit|ats|template|tracker|credits?|this (one|draft|version)|good enough|should i)\b/i.test(t)) return false;
  // "you" as the assistant, not the applicant.
  if (/\b(you (changed|wrote|did|made|added|removed|generated|put|invent|invented)|did you (change|write|add|remove|keep|use|invent))\b/i.test(t)) return false;
  return /^(tell (us|me) about|describe|explain|walk (us|me) through|give (us|me)? ?an example|share (an|a|your)|why (do|are|would|did|should) you|what (is|are|was|were|would|do|does|did|makes|interests|motivates|attracted) (your|you)|what (salary|compensation|notice|visa)|how (would|do|did|have|many|long|much) you|how many (years|months)|when (can|could|would|are) you|do you (have|hold|speak|need|require|live)|are you (authorized|authorised|eligible|willing|able|available|comfortable|open|legally|currently|based)|have you (ever|worked|been|led|managed|used|built|handled)|which (of|programming|languages|tools)|please (describe|explain|tell|share|list|provide)|in what ways|can you (describe|explain|tell|share|walk|give|provide))\b/i.test(t);
}
