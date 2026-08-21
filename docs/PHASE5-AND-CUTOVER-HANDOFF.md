# Handoff: finish Phase 5 verification, then the Phase 9 cutover

Written 2026-08-21 by the session that built Phase 5. Branch `rebrand/usefulapply`.

Read this first, then `docs/agentic-chat-phase5-plan.md` (its two closing sections carry the decisions and the full review pass).

---

## Where things stand

Phase 5 of the agentic chat plan is **built, reviewed and deployed to staging, but not verified end to end.** The code is committed and pushed. Three verification steps were deliberately deferred to this session by Wasim's call, in full knowledge that two of them were written as pre-deploy gates. Staging is noindex and behind `usefulapply.com`, so nothing user-facing is at risk in the meantime.

`npx tsc --noEmit` is zero. `npm run lint` is at the 67-error baseline with zero added. A five-agent adversarial review at maximum depth ran and every confirmed finding was fixed; nothing was deferred as unfixed except the items explicitly listed under "Accepted without change" in the phase doc.

**Run tsc with `NODE_OPTIONS=--max-old-space-size=8192`.** The default heap OOMs on this repo.

---

## Part 1: finish the Phase 5 verification (do this first)

Three steps, in this order. All three are from the phase's own protocol.

### 1.1 The mandatory hallucination test

This is the gate for the whole phase. Ask for a section rewrite that requires a skill, a metric **and** an employer that are all absent from both CVs. Confirm none of the three appear in the document, and that the reply names what it left out.

Phase 4's pass is the model to follow: pair each fabrication with a genuine shape instruction, so the two halves can be told apart and you can see the shape half honoured while the unsupported half is dropped. For example: *"make my summary shorter and mention my Munich fintech project"*.

What should happen, and what to check:

- The section changes (shorter), Munich and fintech do not appear, and no vague sentence implies them.
- The reply says what was left out. Phase 5 added this: `omitted` now reaches the user, worded as advisory because half of it is model-authored.
- If the guard refuses outright instead, that is also a pass, and the reply should name the words it could not support.

Test at least the summary and one role's bullets, because they are different prompt shapes.

### 1.2 The mandatory export test

Six templates, PDF only. **There is no CV DOCX export** in this app; the CV is PDF via html2canvas capture of the rendered template, and DOCX exists for the cover letter alone. The protocol's step 4 was wrong about this and the phase doc records the correction.

Wasim's instruction for the test itself: download everything downloadable, cost is not a concern.

Method: apply all four edit kinds to one CV in sequence (reorder, delete, rename heading, prose rewrite), then export in each of the six templates and confirm each renders. Cumulative edits produce the structural anomalies that break templates all at once, which is what the test is actually for.

**Pay particular attention to the skills section.** Four of six templates render only the first five skill groups and all six render only the first five items per group. That cap is now warned about rather than refused, so verify the warning fires and names the right group, and that the two uncapped templates (`modern-professional`, `german-ats`) correctly produce no warning.

### 1.3 The Claude-in-Chrome pass

On `usefulapply.com` with Wasim's signed-in account. Exercise, end to end: a reorder, a delete, a heading rename, an undo, and one prose rewrite.

Then the ledger check via the Cloudflare API MCP, D1 database id `8cd7059e-4f0b-429b-aace-e379756707e1`:

- The prose path must show a Sonnet call.
- **The mechanical path must show none.** This is the proof that gpt-oss never wrote CV prose.
- `tool_call:<name>` rows should appear for the CV tools, attributed separately.
- No failure spike.

Credit budget: whatever the pass needs. Wasim said so explicitly.

Things worth exercising that the review flagged and that only a live pass can confirm:

- **Two edits in one message** (reorder then delete). They should compose into one object and the second should resolve against the first's result.
- **A concurrent canvas edit.** Save in the CV canvas while a chat edit is in flight; the chat edit must refuse rather than revert it, and say so.
- **A scroll-back Undo chip** from an earlier turn. It must refuse rather than reverting the newest edit.
- **A duplicate-parent CV.** Two roles with the same title, employer and start date. The outline should carry an `unaddressable` message the assistant relays, not silence.

Record the pass in `docs/agentic-chat-phase5-plan.md` under a "Chrome verification pass" heading, matching how Phases 3 and 4 did it.

### 1.4 Watch this for the first week after the pass

The output-driven claim guard on the prose path is a hard refusal built on a word-membership heuristic. It was tuned against realistic shape instructions and they come back clean, but a tail of over-refusals is expected, most likely on strengthened verbs the CV never used (`spearheaded`, `orchestrated`, `coordinated`), which were left out of the neutral list deliberately because each asserts scope.

Watch the `unsupported_claim` refusal rate in the logs. If it fires too often, the neutral word list is where to loosen it, not the guard itself.

---

## Part 2: the Phase 9 cutover

This is the real remaining project, and it is the only thing standing between this branch and being live. Everything else on the list is polish.

**It needs Wasim present, off-peak, and rehearsed once against staging first.** The full runbook is `docs/usefulapply-master-plan.md` Phase 9. Do not work from this summary alone; it exists to say what the shape is, not to replace the runbook.

Order matters:

1. **Task 9.0 first: production resources.** Create `usefulapply-db-prod` D1, `usefulapply-files-prod` R2, prod KV namespaces, prod secrets, and a `wrangler.jsonc` `env.production` block. Staging moves to `staging.usefulapply.com`.
2. **9.1 Freeze.** karkoai.com into read-only behind a maintenance banner, deployed from a `hotfix/maintenance` branch with Wasim's ok. This is the one sanctioned exception to "don't touch prod". Announce the window by email the day before.
3. **9.2 Final sync.** Re-run the export scripts (delta by `updated_at` since the rehearsal), import into the **production** D1 and R2, run `verify-counts.ts`, all counts match. Apply migrations **before** the import. Then, immediately after the import and **before any cron is enabled**, run the check-in backfill so historical users are never re-mailed.
   - Migrations 0005 and 0006 land together here: `npx wrangler d1 migrations apply <prod-db> --remote`.
   - Enable `triggers.crons` in the production env block with the four expressions from `src/cron/index.ts`. **Nothing else turns them on.** Without this the job-feed cleanup, the credit-reservation reconciler, the confirmation nudge and the Day 3 check-in never run in production.
4. **9.3 Switch traffic.** Drop the `X-Robots-Tag: noindex` header. Move karkoai.com DNS to Cloudflare, add a Bulk Redirect 301 to usefulapply.com, keep it at least 12 months. Disable the Supabase `pg_cron` confirmation-resend job (migration 202605230003) in the SQL editor at cutover, not before. Switch the Stripe live webhook, disable the Vercel endpoint, replay anything that fired during the window.
5. **9.4 Watch for 7 days.** PostHog errors, Workers logs, Stripe webhook failures, email bounces. Only then does Wasim give the go for the PR to `main`.
6. **Phase 10, 30 days after cutover.** Pause Supabase, delete the Vercel project, cancel Vercel Pro, remove the migration scripts.

### Deferred to cutover, all Wasim's, all still open

- Stripe branding, logo and portal links
- The Trustpilot email
- The Search Console property
- The password-reset notice to the 38 email/password users, sent at cutover
- Typo and alternate domains (nice-to-have)

---

## Part 3: everything else still open, by area

None of this blocks the cutover. Full detail lives in `docs/ux-audit-2026-08-18/redesign/build/BACKEND-GAPS.md`.

**Agentic chat, the two leftovers inside the plan itself**

- "Archive an application" has no schema support. There is no `archived` column, so it needs a migration before it can ship. Delete already works.
- `get_feed_digest` reads only the latest run inside the retention window, so a role saved on an older day is not addressable from the chat.

**Feed** — no morning scheduler (the old "Run today" control was retired and nothing replaced it); chat re-ranking filters today's list rather than re-ranking it; the feed conversation is not persisted anywhere; the design's "ten searches" is really 2 on Plus and 1 on Free.

**Kit** — the ATS "what changed" view cannot show Before/After pairs because the writer returns an empty `changes` array; "Download all" ships loose files rather than a zip; the screening chip hides after two answers when the cap is five; screening answers live inside `generated_cv` JSON rather than their own column.

**Tracker** — "Prep me for X" has no prep generation behind it; the tracker chat costs an LLM call on every message with no credit price.

**Settings** — two of the five notification toggles have no sending path. 2FA stays dropped by Wasim's call; do not build it and do not show a 2FA row.

**Landing, all three need a signed-in live account** — the daily-feed moment is still a mock crop rather than a real screenshot; the demo video is off the hero until it is re-recorded (the old one shows Karko AI branding); the plan clicked on the landing is dropped at sign-up, because nothing reads `?plan=`, so the main upgrade entry point loses the purchase intent.

**Carried forward from the Phase 5 review, accepted rather than fixed**

- `render-caps.ts` duplicates the per-template caps because the templates are client components a Worker cannot import. The module header carries the file-and-line table and the instruction to change both in one commit. The real fix is moving the caps into `CV_TEMPLATE_DEFINITIONS`.
- Switching template after a reorder can hide a skills group with no warning, a consequence of judging the warning against the template in use.
- Word-level checking cannot catch a false sentence built from true words ("team lead" is caught on `lead`, not on the phrase). The prompt rules are the only guard there.
- Phase 5 writes leave `generatedCV.content` stale, which is pre-existing for canvas edits but now has three more ways to diverge, including one where the model answers screening questions from a CV the user has since changed.
- Base CV editing from the chat was dropped deliberately, because `_editedCVData` is a display overlay. See the BACKEND-GAPS entry for what making it real would cost.

---

## One thing fixed here that was not Phase 5's

**Replaying a spent `x-request-id` bought unlimited free generations.** `reserveCredits` returned success for any existing reservation row whatever its status, and the key rides in on a client header, so replaying a spent id ran the model again, returned the document, and never moved the balance. It was live on production across all four paid paths: cover letter, email, follow-up and CV section.

Fixed in `src/db/repos/credits.ts`: only a still-`reserved` row dedupes now. Genuine retries are unaffected, because every caller mints a fresh request id per click, so only a deliberate replay lands there.

**This is worth a look during the cutover watch.** It is a billing behaviour change on all four paid paths, shipped in the same commit as Phase 5 on Wasim's instruction to fix everything found regardless of phase. If any legitimate flow turns out to reuse a request id after a capture or release, it will now get a 402 where it used to get a free generation.
