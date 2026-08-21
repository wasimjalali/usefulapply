# Next session brief, drafted 2026-08-21 late night

One work item plus leftovers. Context: the 2026-08-22 brief is fully executed (Page-U logo
across the app, favicons and email logo; credit-price talk removed from chat including the
ChatPanel client regen flow; step4-chat-edit captured and wired; claim guard no longer
reports shape words like "one, sharper" as CV omissions). The /pricing plan cards were also
restyled to the home-page card design with simplified item copy (commit 3b9a10f5). All
deployed to usefulapply.com on rebrand/usefulapply.

---

## 1. Stage a high-fit demo application, then reshoot the landing captures from it

**Wasim's call (2026-08-21).** The current captures come from organic test applications, so
the scores they show are middling: the shipped step4 frame (TeamSnap) shows ATS 42%, the
Pixellot frames showed 74%. Instead: write one job description that is highly compatible
with the Alex Morgan demo CV, run it as a fresh application, and take ALL the landing images
we want from that single application, then replace the current images.

**Staging the application.**
- Write the JD against the demo CV's actual content: Senior Product Manager, B2B SaaS,
  API and integration products. Mirror its skills (REST APIs, B2B integrations, roadmap
  planning, backlog prioritization, OKRs, A/B testing, Mixpanel, SQL, Jira, Figma,
  stakeholder alignment, go-to-market), 6+ years, San Francisco or remote.
- Company must be clearly fictional (no real company's name or branding). Something plain
  like "Northbeam Systems" or similar, checked against real brands first.
- Flow: New Application, paste the JD, run the fit analysis (expect a high match score),
  then generate the full kit (expect a high ATS score). Cost: 0.5 + 2.0 credits, plus 0.5
  per chat rewrite staged for step 4. Wasim's standing answer on capture spend from
  2026-08-21 was "don't worry about the credit use, as much as needed", but confirm at
  session start before spending.

**Captures to retake from the staged application** (same filenames, drop-in replacements in
`public/images/moments/`, 2880x1800 PNG converted to WebP q85 via sharp):
- `hero-workspace.webp`
- `step2-fit-result.webp` (the high match score is the point)
- `step3-kit-tabs.webp` (high ATS badge visible)
- `step4-chat-edit.webp` (chat rewrite landing in the preview; the claim-guard fix is live,
  completion replies are clean now)
- `step5-tracker.webp` only if the staged application improves the frame (it will appear in
  the tracker once generated); `step1-job-board.webp` shows the feed and is unaffected,
  leave it unless the frame has aged.

**Capture recipe that works (proven twice, 2026-08-21).** The viewport-2880 `zoom: 2` trick
does NOT work: media queries evaluate at 2880px and collapse the canvas. Use a second
Playwright context and drive it:

```js
const cookies = await page.context().cookies();
const nctx = await page.context().browser().newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
await nctx.addCookies(cookies);
const np = await nctx.newPage();
await np.goto('https://usefulapply.com/dashboard');
// drive np, then:
await np.screenshot({ path: '...', type: 'png', scale: 'device' });
```

`globalThis` does not persist between `browser_run_code_unsafe` calls; re-find the context
each call with `page.context().browser().contexts().find(c => c !== page.context())` and
close it when done.

**Method rules, learned the hard way.**
- Open and visually judge EVERY frame before shipping. Twice now a technically perfect
  capture carried a content problem only visible by looking (a gate instead of an edit; a
  garbled completion reply).
- Shoot in a conversation with no QA residue. Prior test exchanges (fit-check questions,
  old gated replies) sit above the money bubble and leak into frames.
- Watch for the "New messages" jump-to-bottom pill overlaying text when scrolled up; hide
  it or scroll to bottom. The chat/canvas splitter position is per-view.
- Privacy: Alex Morgan demo persona only (alex.morgan@email.com, (415) 555-0182). No live
  balances appear in chat anymore, but re-check each frame anyway.
- Raw PNGs stay untracked in `landing-captures/` (gitignored); only the WebPs are committed.

---

## 2. Leftovers, smaller

- **/pricing residual credit language.** The plan cards are done, but the add-on band still
  sells "50 credits", the "How credits work" section (`CREDIT_PRICES` from
  `src/lib/plans.ts`) is credit-first, and the pricing FAQs likely mention credits. Decide
  with Wasim how far the simplified applications-and-rewrites language goes on this page.
- **Feed chip routing, product call.** Main chat never surfaces the propose_feed_application
  confirm chip: a prompt rule ("Generating kits and fit analyses is not yours to trigger...
  point the user there", chat route.ts ~573) plus the ranker digest answer path win instead.
  Pre-existing, not a regression. Decide whether main chat should offer the paid fit
  check/kit for feed roles.
- **Non-chat price tags.** Job Board cards ("Check fit · 0.5"), the paste-a-job decision
  chips and GuidedLine still wear per-action prices. Out of scope of the chat pass by
  design; needs Wasim's call whether they follow the simplified language too.
- **Stray chunk 404 after deploys.** Two verification passes saw a 404 on one
  `_next/static/chunks/*.js` reference right after deploying. Looked like CDN cache lag and
  pages rendered fine; check whether it persists on a cold load.
- **Logo verification gaps.** Admin shell (behind Cloudflare Access) and a real sent email
  were not visually verified; the email logo asset itself is live and correct.
- After the landing work: Phase 9 cutover (runbook in docs/usefulapply-master-plan.md,
  Wasim present, rehearse against staging first).

---

## Ground rules (unchanged)

tsc 0 errors and lint within 72 errors / 60 warnings before any commit (tsc needs
`NODE_OPTIONS=--max-old-space-size=8192` on this repo). Conventional commits pushed to
rebrand/usefulapply only. Deploy:
`NEXT_PUBLIC_SITE_URL=https://usefulapply.com NEXT_PUBLIC_SITE_STAGE=staging npm run deploy:cf`.
Browser passes go to subagents; the orchestrator personally judges every capture frame.
Implementation delegates to ox alpha via opencode while the free week lasts (re-evaluate
after ~2026-08-28).
