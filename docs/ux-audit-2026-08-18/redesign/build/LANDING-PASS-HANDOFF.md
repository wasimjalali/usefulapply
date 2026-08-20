# Landing page pass: handoff for the next session

**Written 20 August 2026.** Branch `rebrand/usefulapply`, `main` off limits,
no PR. Staging is https://usefulapply.com, Worker `68fd223e`, git HEAD
`c32ab5a9` (plus anything Wasim landed after; run `git pull` and check the
log first). This doc is uncommitted when written; commit it with your first
docs commit.

## What this session is

A full landing page pass: positioning, copywriting, design mockup, then
implementation. Wasim drives it live in this session; this is not a solo
agent kickoff. The landing is the most important surface right now.

## The positioning brief (write copy against this, nothing else)

Useful Apply is **not spray-and-pray and not auto-apply**. It is the
all-in-one companion for a job search: it prepares everything you need to
apply (fit check against your CV, tailored CV, cover letter, application
and follow-up emails, screening answers, a daily job feed, a tracker), and
**you stay the decision-maker**. You verify, you send, you apply. The
product does the preparation; the human makes the call.

Due diligence: every claim on the page must be true of the shipped product.
The existing copy discipline already caught one invented feature
("Priority generation", removed 19 Aug); do not add new ones. Real numbers
and real screens only.

## Order of work

1. **Copy pass.** Rework the hero, moments, plans and any section copy
   against the brief. Draft, then polish at the Opus tier per the standing
   escalation rule (Sonnet drafts, Opus critiques and finals). Copy rules
   are hard: no em dashes, contractions, short sentences, no filler,
   "X, Y and Z", no subtitle/helper copy under headings by default.
2. **Design mockup.** Build the landing mockup with the `/design` command
   as an artifact, the same way the UX redesign artboards were done. New
   copy in place, image slots marked. Wasim reviews and finalizes there
   before any code.
3. **Implementation.** Apply the finalized layout and copy to
   `src/app/page.tsx` (and Navbar/footer if the mockup changes them).
   Surgical edits; the app shell is not in scope.
4. **Captures, last.** Retake the hero and moment images on the finished
   UI at 2240px+ wide (2x the 1120px hero render), WebP/AVIF, light. The
   daily-feed moment stays the agreed placeholder until the end-to-end
   pass (BACKEND-GAPS.md C1). The demo video (C2) is still pending a
   re-recording; do not block on it.

## Current landing state (so nothing is rediscovered)

- Nav (since `65a6e757`): What you get (anchor), Pricing, Blog, About,
  Log in, CTA. `/about` and `/blog` are real pages.
- Hero renders up to 1120px, moments 760px in a `max-w-7xl` container,
  `quality={90}` and `sizes` hints set (`1f9d280f`). Current captures are
  1440px, so they are soft on retina until retaken.
- The page height was trimmed to ~4,495px on 19 Aug (target 4,500): hero,
  moments, founder, plans tightened; the final navy band and footer are
  byte-for-byte the old design by Wasim's call. Respect that unless the
  new mockup deliberately changes it and Wasim approves.
- UI font is now Inter globally (`ce2e6bec`); the design system typography
  section in `.claude/rules/design-system.md` was rewritten. No serif
  anywhere in app or landing. Brand wordmark keeps Plus Jakarta.
- Landing and pricing are edge-cached with `s-maxage=300`; a copy change
  shows within 5 minutes or after a hard refresh.
- Signed-out CTA logic uses a localStorage auth hint (`8387ad4e`); do not
  regress the no-flash behavior when touching the hero.

## Constraints and gates

- Fences: no Stripe webhook or credit-deduction logic, no D1 schema or
  migrations, no Better Auth config, no `src/lib/agents/**` prompts. A
  landing pass should touch none of them.
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` must be 0.
- `npm run lint` must not exceed 72 errors and 60 warnings. **Warning: it
  sits at exactly 72 errors, zero headroom.** Three were added by the UI
  pass: a setState-in-effect in `src/components/marketing/Navbar.tsx:30`
  and two `any` in `src/components/settings/CvDocumentsPane.tsx:82,132`.
  Fixing those three first buys the headroom this session will want.
- Deploy: `NEXT_PUBLIC_SITE_URL=https://usefulapply.com NEXT_PUBLIC_SITE_STAGE=staging npm run deploy:cf`.
  Transient Cloudflare errors have resolved on a straight retry.
- Never INSERT, UPDATE or DELETE against the remote database.
- Commit in logical chunks, conventional commits, push to
  `rebrand/usefulapply` only.

## Deferred, not forgotten (do not do these in the landing session)

- **Repo cleanup:** the UI pass committed `todos/` review scratch (~4,900
  lines) and three root PNGs (`landing-hero-1440.png`,
  `landing-what-you-get-scroll.png`, `pricing-scrollbar-default.png`).
  Remove in a chore commit when convenient; the three lint fixes above can
  ride along.
- **Visual verification walk** (Max and Free accounts) moved to the end of
  the track; Wasim already walked most of it himself.
- **A7:** one live Free run to confirm the SerpAPI reserve, then close the
  entry. Costs real money; one run only.
- **Signup gate question** from the ui-tester: gate before the chat/kit
  view or only at download. Product call for Wasim.
- **Scheduled feature batch** (A1, A2, A4, A5, A6, C4, C6) per
  BACKEND-DECISIONS.md; not part of any current pass.

## Background reading, only if needed

`BACKEND-DECISIONS.md` (locked decisions), `BACKEND-GAPS.md` (C1, C2),
`UI-FEEDBACK-2026-08-20.md` (the eleven built UI fixes),
`SWEEP-HANDOFF.md` (backend pass history). All in this directory.
