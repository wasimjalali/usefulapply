# Review instructions

These tune Claude Code Review (the managed PR service) and the local `/code-review` command
for Useful Apply. Injected as highest-priority guidance. Keep it short - long files dilute the
rules that matter most.

## What "Important" (merge-blocker) means here

Reserve the Important (red) severity for findings that would break behavior, leak data, or
cost money:

- An API route missing any step of the security checklist: Better Auth session via `getCurrentUser()`, rate
  limiting, input-length validation, generic error messages.
- `userId` read from the request body instead of the authenticated session.
- Credit or Stripe logic that over- or under-charges, or a webhook processed without
  `stripe.webhooks.constructEvent()` signature verification.
- Anti-hallucination violations: a CV or cover-letter claim sourced from the job description
  rather than the Primary or Master CV.
- Secrets, API keys, or PII in client code, logs, or error messages.
- A D1 migration that isn't backward compatible, or a query not scoped to its caller.

Style, naming, and refactor suggestions are Nit (yellow) at most.

## Cap the nits

Report at most five Nits per review. If there are more, say "plus N similar" in the summary.
If everything found is a Nit, lead the summary with "No blocking issues."

## Do not report

- Anything CI already enforces: TypeScript errors, ESLint, formatting.
- Generated files, lockfiles, and `node_modules`.
- Mobile-only layout issues. Desktop and tablet (>=768px) are the target; mobile is not a priority.

## Always check

- New API routes follow the full security checklist (see `.claude/rules/security.md`).
- User-facing strings contain no em dashes (U+2014) and no hollow filler ("Great!", "Sure!").
- Credit deductions match the source of truth in `src/lib/supabase/credits.ts`.
- Every skill, metric, and claim in generated CVs and cover letters traces to the Primary or
  Master CV, never the job description.
