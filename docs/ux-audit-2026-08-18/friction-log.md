# Friction log, 18 August 2026

Every point where the product cost the user thought, time, trust or money. Rated by what it does to activation, not by engineering effort.

Covers the anonymous, free-user and Max-user flows end to end. Billing was captured up to the Stripe portal boundary; no card was used.

Severity key: **Critical** blocks activation or misstates money. **High** actively misleads or dead-ends. **Medium** slows the user down or erodes polish. **Low** cosmetic.

---

## Critical

### F1. The free user hits a wall before seeing any output
`08-free-billing-limits/01-out-of-credits-paywall.jpg`, `02-subscription-free-0.5-credits.jpg`

The free account held **1 credit** when the session started. Every surface promises 4 credits and 2 full applications: landing, pricing, the signup banner, and the comparison table on the subscription page itself. A fit check (0.5) plus an application (2.0) needs 2.5.

So the run went: upload CV, wait 50 seconds, paste job ad, wait 20 seconds, see a 76% fit score, click Generate, get a pricing modal. The user never saw a CV, a cover letter or an email. The entire proposition is "see the finished application" and the free tier cannot produce one.

**Root cause found, see `bugs.md` B1.** The monthly credit reset never runs. `processMonthlyReset()` exists in `src/db/repos/credits.ts` but nothing calls it, and every cron trigger in `wrangler.jsonc` is commented out. 29 of 38 users on staging are overdue for a reset, the oldest since 1 March 2026. The free account's last reset was 3 March. Two Max subscribers have had no credits since March either. Fix the reset and backfill; the copy is not the problem here.

### F2. The paywall fires after the click, not before it
`08-free-billing-limits/01-out-of-credits-paywall.jpg`

"Generate application kit" renders as a live gold primary button while the user has 0.5 credits and the action costs 1.5. The check happens server-side after the click.

**Fix:** the button should know the price and the balance before it is pressed. Put the cost on the button ("Generate kit, 1.5 credits"), and when the balance is short, make the button itself the upgrade path with the reason inline. Never let a user commit to something the system already knows it will refuse. That is the Cursor discipline: nothing clickable that will then say no.

---

## High

### F3. The assistant claims work is happening that is not
`05-free-application-kit/01-cover-letter-empty-state-popover-overlap.jpg`

After the paywall blocked generation, the chat printed **"🚀 Generating your full application..."** with no error and no retraction. It survived a full page reload and was still there minutes later while the Cover Letter panel read "No cover letter yet". Two surfaces telling the user opposite things.

**Fix:** revert the optimistic message on rejection and replace it with what happened plus the one action that resolves it.

### F4. Credit costs contradict each other across three surfaces
- Pricing page: "Full Application, **2** credits"
- Dashboard hint: "Full kit costs **2** credits"
- Paywall modal: "This action requires **1.5** credits"

The 1.5 is 2.0 minus the 0.5 already spent on the fit check, which is a fair policy that is never explained. The user just sees three numbers for one action.

**Fix:** say it once at the point of choice. "Fit check 0.5. Full kit 2, or 1.5 if you check fit first."

### F5. The credit counter is wrong until you reload
`04-free-fit-analysis/04-fit-result-76pct.jpg`, `10-max-generation/04-kit-ready-optimised-cv-78pct-ats.jpg`

Reproduced on both accounts. The free chip read "1 credits" after spending 0.5. The Max chip read "184 credits" after a 2-credit generation and only corrected to 182 on reload. During the whole result-reading period the balance shown is wrong.

**Fix:** include the new balance in the SSE completion payload, or refetch on completion.

### F6. Pricing says the job feed is paid. It is not.
`00-anonymous/02-pricing-scroll-01.jpg`, `06-free-job-feed/04-feed-results-top.jpg`

Pricing lists Smart Job Feed as Plus and Max only, with a dash for Free, and the in-app comparison table shows ✕. On the free account the feed ran, searched live and delivered 5 ranked jobs with an upgrade nudge underneath.

Either the gate is missing or the copy is wrong. Today the marketing undersells the free tier and the free tier gives away the headline paid feature silently.

**Fix:** decide which is true. A free top-5 daily feed is a strong hook if you say so.

### F7. The paid feed shipped three copies of the same job in its top five
`12-max-job-feed/09-feed-results-duplicate-avetta-BUG.jpg`, `10-feed-results-third-avetta-duplicate.jpg`

The Max feed returned 20 jobs. Positions 1, 2 and 5 were all "Product Manager - B2B SaaS" at Avetta with identical descriptions and the same 87.5K-180K salary, listed under "Avetta", "Avetta, LLC" and "Avetta, LLC". The completion modal reported **DUPLICATES: 1**.

The daily feed is the headline paid feature. Fifteen percent of the visible top of it was one job three times.

**Fix:** dedupe on normalised company plus title plus salary, not on exact company string.

### F8. The subscription page shows the balance where the allowance should be
`14-max-billing/01-subscription-max-monthly-label-BUG.jpg`, `08-free-billing-limits/02-subscription-free-0.5-credits.jpg`

Max plan: "182 credits remaining" and directly below "Monthly: **182**". It should read 200. Free: "0.5 credits remaining / Monthly: 0.5". The field is repeating the balance instead of showing the plan grant, so the one screen that could tell a user what they are entitled to tells them nothing.

### F9. Generating a kit marks the job as Applied
`13-max-tracker/01-tracker-18-all-vs-10-jobs.jpg`

The Pixellot application appeared in the tracker with status **Applied** immediately after generation. Nothing was sent anywhere. The tracker's whole value is knowing where each application actually stands, and it starts by recording something untrue.

**Fix:** default new rows to "Drafted" or "Ready to send".

### F10. The marketing header does not know you are signed in
`00-anonymous/01-landing-scroll-01.jpg`

Signed in as Max, usefulapply.com still showed "Log in" and "Try It Free". A returning paying user has no route back to their work except typing /dashboard.

### F11. /login is a 404
`99-misc/BUG-login-url-404.jpg`

The real route is `/auth/login`. `/login`, the URL every user and every autocomplete will guess, hits the 404 page.

---

## Medium

### F12. The base CV renders with German section headings
`09-max-account/02-dashboard-base-cv-german-headers-BUG.jpg`, `11-max-application-kit/12-original-cv-german-headers-BUG.jpg`

An entirely English CV renders its Original view as **BERUFLICHES PROFIL, KERNKOMPETENZEN, SPRACHKENNTNISSE, BERUFSERFAHRUNG**, and dates as "January 2022 – Heute". The Optimized view is correctly in English. Language detection is misfiring on the base render.

### F13. The template picker shows blank white cards for eight seconds
`11-max-application-kit/09-template-picker-blank-previews-BUG.jpg`, `10-template-picker-loaded-8s-later.jpg`

Open Templates and you get two full-height empty rectangles labelled "Premium ATS" and "Modern Professional". The previews paint about eight seconds later. The header says "6 Templates" but only two are visible with no scroll affordance or arrows to reach the other four.

### F14. Edit feed has no exit once you scroll
`12-max-job-feed/06-edit-feed-no-exit-BUG.jpg`

Opening "Edit feed" replaces the feed and its toolbar with a 2,798 px settings panel whose only close control is a small × at the very top. Scroll down and there is no way back except scrolling up or reloading. Clicking the Job Feed tab does nothing because it is already the active tab.

This matters because the panel behind it is the best screen in the product (see the flow map), and it is a trap.

### F15. CV parsing is 50 seconds of nothing
`03-free-cv-upload/01-parsing-started.jpg`

A static spinner reading "Parsing your CV... This may take 30-60 seconds", while the right panel still says "Upload your CV from the left panel" and the chat input is disabled with "Upload your CV first to get started". The two panels contradict each other and the one the user is about to work in acknowledges nothing.

**Fix:** stream the real stages the way the fit analysis already does. The pattern exists in the product; use it here.

### F16. The first real decision is presented cold
`04-free-fit-analysis/01-jd-pasted-two-cta-choice.jpg`

Straight after parsing the user faces "Generate application kit" and "Check fit first" as two equal buttons, with the cost difference in 11px grey text. A first-timer has no basis to choose, and this is the highest-stakes decision in the product.

**Fix:** one primary path. Default to the fit check, it is cheaper and it is the honest sell, and demote direct generation to a secondary link.

### F17. Generation blanks the canvas and moves the tab under you
`10-max-generation/03-generating-blank-canvas.jpg`

During the 50-second generation the left panel goes white and the active tab switches by itself as artefacts complete. Three stages read "Active" at once while the progress bar sits at 45%, so the checklist reads as sequential but does not behave that way.

### F18. The job-feed popover eats clicks on the panel tabs
`05-free-application-kit/01-cover-letter-empty-state-popover-overlap.jpg`

"5 new roles for you today" renders directly over the Cover Letter and Email tabs and swallows the click. Reproduced first try.

### F19. Job feed elapsed timer showed 3m 0s after 4 seconds
`06-free-job-feed/02-building-feed-progress.jpg`

All four stage rows were already green while the header still said the feed was being built. On the later Max run the timer was correct, so this looks like state carried over from a previous run.

### F20. Recent Applications lists company only
`09-max-account/03-recent-applications-panel.jpg`

Two entries both read "Pixellot, 8/18/2026" with no role title, so they are indistinguishable. Dates are US format on a product whose own feed settings say the user's timezone is Berlin.

### F21. Tracker counts contradict each other
`13-max-tracker/01-tracker-18-all-vs-10-jobs.jpg`

The tab reads "18 ALL" while the line directly beneath reads "10 jobs".

### F22. Auth pages are a dead end
`00-anonymous/03-auth-login.jpg`

Login, signup and forgot-password have no header, no nav, no link back to the site, and the logo is not a link. A user who hesitates has only the back button.

### F23. Auth page titles are wrong and doubled
Signup and forgot-password both carry the browser title **"Sign In | Useful Apply | Useful Apply"**.

### F24. The landing page still shows Karko AI
`00-anonymous/01-landing-scroll-01.jpg`, `-04`, `-05`

The hero product shot and the three feature shots all show the old Karko AI logo and a `karkoai.com/dashboard` URL bar. First image every visitor sees.

### F25. /features has blank stretches and content that does not paint
`00-anonymous/06-features-scroll-06.jpg` and after

At several scroll positions the page rendered as empty cream. A visitor scrolling at normal speed sees blank screen where a feature card should be.

### F26. Settings break out of the app
Profile, Account, Subscription and Notifications are top-level routes with "Back to App". The app shell, credit balance and panel state all vanish. Changing an email preference should not feel like leaving the product.

### F27. Every settings heading is stated twice
`02-free-onboarding/02-profile-settings.jpg`

Page header "Profile / Your personal information", then immediately "Profile Information / Update your personal details and profile photo". Same on all four tabs. Four labels where one would do.

### F28. Three long marketing pages before any product
Landing 9,197 px, Features 9,644 px, Pricing 5,018 px at a 902 px viewport. Ten screens of scroll on the homepage alone.

---

## Low

### F29. "1 credits"
Singular and plural not handled in the header chip.

### F30. Generated content contains em dashes
`11-max-application-kit/08-screening-answer-generated.jpg`

The generated screening answer joins two clauses with an em dash ("I redesigned the onboarding workflow [em dash] simplifying the initial setup flow"). Your own copy rules ban the em dash as the loudest AI tell, and this text goes straight into an ATS field a recruiter reads. The rule should apply to model output, not only to UI strings.

### F31. Duplicate tracker row on the free account
`07-free-tracker/01-tracker-list.jpg` shows "Agentic AI Software Engineer" twice, same company, same date, same 52% score.

### F32. Feed profile shows "Enterprise Saas" and "Consumer Saas"
`12-max-job-feed/02-edit-feed-ai-search-profile.jpg`. Should be SaaS.

### F33. Company name mismatch in feed cards
`12-max-job-feed/11-job-detail-modal.jpg`. card says "Youth Sports Business Report Co.", description says "TeamSnap is seeking". Aggregator data quality, but the user sees the wrong employer.

### F34. Sticky header overlaps section headings
On jump-scroll the floating nav sits on top of section titles on the landing page.

---

## The pattern behind all of it

Four themes account for nearly the whole list.

**1. The product asserts things it does not know to be true.** Wrong credit balance in two places, a generation that is not running, a tracker row marked Applied when nothing was sent, a monthly allowance field showing the balance, a feed reporting 1 duplicate while showing 3, a header that thinks a signed-in user is signed out. Every one of these is optimistic state that was never reconciled with reality. In an AI product this is the most expensive class of bug there is, because the user's only way to judge output quality is whether the app has earned their trust.

**2. Cost is revealed after commitment, not before.** The credit model is fair and defensible. The user only ever learns the price at the moment of refusal.

**3. The user is asked to choose before they understand the choice.** Two equal CTAs after upload. Seven header destinations on the marketing site. Three separate ways into a generation. Four settings tabs on a different page. Cursor's trick is not fewer features, it is that at any moment there is exactly one obvious next thing.

**4. The best work is the hardest to find.** The ATS insights modal, the inferred AI search profile, the ten query strategies with rationales, the follow-up email timing chip: these are genuinely differentiated and they sit behind small pills, chips and a panel with no exit. The product undersells itself in exactly the places it is strongest.

### If you change one thing

Make the first run a line, not a room. Upload, see fit, see the kit. One primary action on screen at a time, the price stated before the click, and nothing else competing for attention until the user has finished their first application and seen what the product actually produces.
