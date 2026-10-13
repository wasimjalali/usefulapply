Review PR #143 in this worktree (branch feature/email-subjects-in-code, one commit on top of main: `git diff origin/main...HEAD`). Read-only: change no files.

The change: email subjects (application and follow-up) are now built in code in `src/lib/agents/unified-writer-agent.ts` instead of written by the model. The email prompts in `src/lib/agents/prompts/email-prompts.ts` now ask for a body-only JSON object. Spec: `<prefix>: <title>, <name>` (German application email: `Bewerbung als <title>, <name>`), at most 60 characters after dash/typo cleanup; over the cap, use the primary title (text before a spaced " / ", " | ", " - ", en or em dash, or "("), then drop the name, then cut at a word boundary. No title: `<prefix>: <name>` (German application: `Bewerbung: <name>`). A model reply that still includes `subject` is accepted and the subject ignored. Callers: kit generation, `src/app/api/regenerate/route.ts`, `src/app/api/tracker/follow-up/route.ts`.

Already verified, don't repeat: tsc clean, ESLint clean on touched files, the existing email validation suite passes, a 19-case acceptance test passes, and two real Sonnet 5.5 kits returned body-only JSON with no retries.

Look for:
- Security: prompt injection via job title or name (they're ad-derived or user-provided and now land in the subject string; anything that could reach HTML, a header or a prompt unsanitised).
- Logic: the cap algorithm, empty or whitespace-only title/name, unknown languages, cleanup changing length, the retry path (`generateEmailWithValidationRetry`), `isEmailAnswerShape` now only checking the body (does `parseStrictJsonObject` still pick the right object when a reply has several JSON objects?), anything in the regenerate or tracker routes that relied on the model's subject.
- Prompts: is the email prompt still coherent, with no dangling references to subject rules, and are the anti-hallucination and rewrite-instruction blocks intact?
- Tests: are the updated tests in `unified-writer-agent.email-validation.test.ts` correct for the new behaviour?
- Does it do what the task asked?

Report findings as a list of `{ finding, severity: "critical" | "high" | "low" | "none", file, line }`, then a DISMISSED list: everything you considered and why it isn't a defect. An empty findings list without a DISMISSED list is not acceptable.
