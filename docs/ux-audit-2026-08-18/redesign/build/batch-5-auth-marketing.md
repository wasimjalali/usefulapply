# Batch 5: the auth pages and the marketing site (flows 6 and 7)

**Status:** built 19 August 2026 by Claude on `rebrand/usefulapply` (uncommitted). Open: the daily-feed screenshot is still the artboard mock, agreed with Wasim to replace it in the end-to-end pass. Six items filed in `BACKEND-GAPS.md`.
**Branch:** none. Work directly on `rebrand/usefulapply` (Wasim, 19 Aug 2026).
**Design of record:** `../flow-6-auth.md` (PNGs `../flow-6-artboards/png/`: A1 Log in, A2 Sign up, A3 Forgot password, A4 Check email) and `../flow-7-marketing.md` (PNGs `../flow-7-artboards/png/`: M1 Landing 1440x4432, M2 Header states). Rules: `../../design-philosophy.md` section 5.

Do part A (auth) first, then part B (marketing).

## Part A: auth pages (flow 6)

Read `../flow-6-auth.md` in full, the four A PNGs, then `src/app/auth/**`, `src/components/auth/*`, `src/app/layout.tsx` (title template).

1. **Same header as the guided line:** wordmark linking to usefulapply.com, one quiet text link top right (per page: "New here? Try it free" on log in; "Log in" on the others). No "Welcome back" subtitles.
2. **One card per page** (440 px, white on cream): serif heading, Google first, "or" rule, fields, one gold button, one line under the card for the other path. Pages and copy exactly as the doc's table: `/login` ("Log in", Forgot password? right-aligned, gold Log in, "Don't have an account? Sign up"), `/signup` ("Create your free account" + "4 credits a month, no card.", name, email, password, gold Create account, terms line, "Already have an account? Log in"), `/auth/forgot-password` ("Reset your password" + "We'll email you a link. It works for 30 minutes.", gold Send the link, "Back to log in"), check-your-email state after reset request or sign-up verification (mail icon, the address, "Open it on this device and you're back in.", "Nothing after a minute? Check spam, or send it again.", "Wrong address? Start over").
3. **Titles:** one `title` template at the layout level, page-specific first segment ("Log in · Useful Apply", "Sign up · Useful Apply", "Reset password · Useful Apply", "Check your email · Useful Apply"). Fix the doubled "| Useful Apply | Useful Apply".
4. **Errors inline** under the field in one sentence, never a toast ("That password doesn't match this email.", "We couldn't find that address.").
5. **After login** return to `?next=`; a user with no kit lands on the guided line. `/login` and `/signup` keep redirecting to the auth routes. "Try it free" starts the anonymous guided line.
6. Don't change Better Auth config or the callback routes; only the pages and their client calls.

## Part B: marketing site (flow 7)

Read `../flow-7-marketing.md` in full, both M PNGs, then `src/app/page.tsx`, `src/components/marketing/*`, `src/app/features/page.tsx`, `src/app/pricing/page.tsx`, `src/app/sitemap.ts`.

7. **Landing `src/app/page.tsx`:** keep `HeroAurora`, the final CTA section and `Footer`. Replace everything between with: the hero copy from the doc (headline as today with "in one app." in gold, the one-line sub, one gold **Try it free** to the guided line, muted "Your first fit check is on us, no account needed.", the kit screen as the product shot 1040 wide; no second button); the three moments (`#what-you-get`, text 320 px beside a 680 px screenshot, alternating sides, titles and lines from the doc); the short founder note (120 px photo, one quote, "Wasim Jalali, founder"); "Start free. Pay when you're applying every week." with the plan cards; "Compare all plans and features →" to /pricing. Delete `PlatformScrollStack`, `TimeSavingsCalculator`, the trust bar, `PricingAurora`, `ProductShowcase` and the how-it-works list if nothing else imports them (grep).
8. **Product shots:** real screenshots of the built screens at 1440x900 (kit ready, fit result, ATS what changed, daily feed), captured with Playwright from staging or local, saved under `public/images/moments/` as WebP under 150 KB each. Not the mockup PNGs.
9. **Plan cards** are one shared component with the settings modal's PLANS cards (batch 4). Free $0 / Plus $19.99 (MOST POPULAR, tinted, gold "Start with Plus") / Max $79.99, three lines each per the doc.
10. **Header `Navbar.tsx`:** wordmark, Pricing, Log in, gold Try it free; signed in: one outlined **Open app** (to /dashboard) replaces Log in and Try it free. Mobile menu follows the same list. `scroll-margin-top` on anchored sections.
11. **Routes:** delete `/features`, 301 to `/#what-you-get`; remove `/#how-it-works` links; update `sitemap.ts`, the footer `productLinks` ("Features" and "How It Works" become one "What you get" link) and every internal `/features` link (`grep -rn "/features" src`).
12. **`/pricing`:** layout unchanged; copy pass only: plan lines match the cards ("Top-5 daily feed", "20 roles a day, Edit feed", "Priority generation"), credit prices stated once ("Fit check 0.5 · full kit 2, 1.5 after a fit check · rewrite 0.5"), no em dashes.
13. **Metadata:** schema.org `featureList` and the description drop "Smart Job Feed" for "daily job feed"; keep the offers. Final band and footer otherwise unchanged.
14. Page height under 4,500 px at 1440 wide. Grep, list deletions, `npx tsc --noEmit`, `npm run lint`, report.

## Don't

- Don't change Better Auth config, callbacks or session handling.
- Don't redesign the final band, the footer or /pricing's layout.
- Don't add packages.

## Definition of done

A1 to A4 match at 1440x900; titles are single; errors inline. The landing matches M1 (with real screenshots in the moments), the header matches M2 in both states, /features redirects, /pricing copy updated. tsc 0, lint clean, report filed.

## Kickoff prompt (paste into a fresh Grok 4.6 session in this repo)

```
You are the implementer for batch 5 of the Useful Apply UX redesign. Claude Code is the orchestrator; it will review, fix and commit your work. Batches 1 to 4 are merged on rebrand/usefulapply; build on them. Read, in order: docs/ux-audit-2026-08-18/redesign/build/BUILD-PLAN.md, docs/ux-audit-2026-08-18/redesign/build/batch-5-auth-marketing.md, docs/ux-audit-2026-08-18/design-philosophy.md (section 5), docs/ux-audit-2026-08-18/redesign/flow-6-auth.md and flow-7-marketing.md, every PNG in flow-6-artboards/png/ and flow-7-artboards/png/, and .claude/rules/design-system.md. Then do part A, then part B, tasks in order, working directly on the rebrand/usefulapply branch. Do not commit or push. Do not add packages. Do not change Better Auth config, callbacks or session handling; do not redesign the final band, footer or /pricing layout. Finish with npx tsc --noEmit and npm run lint, then end with the exact report format from BUILD-PLAN.md.
```
