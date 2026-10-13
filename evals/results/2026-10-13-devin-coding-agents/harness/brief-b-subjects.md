You are working in a git worktree of Useful Apply, a Next.js 16 app that writes job application kits with an LLM. Work only inside the current directory. Do not commit, push, install packages or touch git state; just leave your changes in the working tree.

## Task: build the email subjects in code, not by the model

Today the model writes the subject of the application email and the follow-up email, guided by prompt rules ("60 characters or fewer", a localized prefix, the job title and the applicant name). Subjects come out inconsistent and sometimes overlong. Build them deterministically in code instead.

Relevant code:
- `src/lib/agents/prompts/email-prompts.ts`: the application and follow-up email prompts, and the localized prefix maps `APPLICATION_SUBJECT_PREFIXES` and `FOLLOW_UP_SUBJECT_PREFIXES`.
- `src/lib/agents/unified-writer-agent.ts`: `generateApplicationEmailWithRetry`, `generateFollowUpEmailWithRetry`, `validateApplicationEmail`, `validateFollowUpEmail`, `isEmailAnswerShape`, and the retry correction text. Every caller (kit generation, `/api/regenerate`, `/api/tracker/follow-up`) goes through these two functions, so the subject must be built there.
- `src/lib/agents/unified-writer-agent.email-validation.test.ts`: existing tests.

## Specification

Inputs: the output language (the same `normalizeLanguage(context.userLanguageOverride || context.detectedLanguage)` the functions already use), `context.job.title` and `context.applicant.name`, each trimmed with inner whitespace collapsed to single spaces.

1. **Application email subject:** `<prefix>: <title>, <name>`, with the prefix from `APPLICATION_SUBJECT_PREFIXES` (English fallback for unknown languages). German is the exception: `Bewerbung als <title>, <name>` (no colon).
2. **Follow-up email subject:** `<prefix>: <title>, <name>` in every language, prefix from `FOLLOW_UP_SUBJECT_PREFIXES` (English fallback).
3. **60-character cap.** The final subject is at most 60 characters. When the full subject is longer, apply these steps in order and stop at the first that fits:
   a. Replace the title with its primary title: the text before the first `/`, `|`, `(`, ` - `, ` – ` or ` — ` in it, trimmed.
   b. Drop the `, <name>` part (keep the primary title).
   c. Cut the primary title at the last word boundary that makes the subject fit. No ellipsis, no trailing punctuation or spaces.
4. **Missing values.** No name: drop `, <name>`. No title: `<prefix>: <name>` in every language, except the German application email, which uses `Bewerbung: <name>`. If both are missing, the bare prefix (`Bewerbung` for the German application email).
5. **The model no longer writes the subject.** Remove the subject rules from both email prompts (system and user prompt text, including the rewrite-instruction "hard limits" lines that mention the subject cap) and from the retry correction text, and change the JSON contract the prompts ask for to body-only (the follow-up keeps `recommendedDelay`). A model response that still includes a `subject` field must be accepted; that subject is ignored. A response without `subject` must be accepted too.
6. The returned objects keep their current shapes (`{ subject, body }` and `{ subject, body, recommendedDelay }`), so callers don't change. The follow-up prompt may keep showing the primary email's stored subject as context.
7. The subject gets the same dash and typo cleanup the code applies today (`sanitizeDashes`, `fixTypos`) only if that can change it; don't let cleanup push it past 60.

## Rules

- Surgical edits that match the existing style. No new files except where a helper truly needs its own module.
- Don't add new test files. Update existing tests in `unified-writer-agent.email-validation.test.ts` that encode the old behaviour (for example "an overlong subject renders as written") so the suite reflects the new spec.
- Don't change anything outside the email subject path.

## Done means

- `npx tsc --noEmit` reports 0 errors.
- `node --import tsx --test src/lib/agents/unified-writer-agent.email-validation.test.ts` passes.
- `npx eslint` on every file you touched reports 0 errors.

When finished, reply with a short summary: each file changed and why.

## Tools in this environment

Edit files with your edit and write tools (edits inside this directory are pre-approved). Only these shell commands are available, and any other command is refused and ends your session at once, so don't try others: `npx tsc`, `npx eslint`, `npm run lint`, `node --check`, `node --import tsx --test`, `node -v`, `git diff`, `git status`, `git log`, `git show`, `git grep`, `ls`, `cat`, `head`, `tail`, `grep`, `rg`, `wc`, `sed -n`, `echo`, `pwd`, `sort`, `uniq`, `diff`. Pipes between these are fine. No `python`, `node -e`, `find`, `mkdir`, `touch` or package installs.
