# Batch 3 of 3: marketing pages, copy and cosmetics (B20, B21, B24 to B29)

Same ground rules and report format as the kickoff prompt. Full text of each bug is in `docs/ux-audit-2026-08-18/bugs.md`. Batches 1 and 2 already touched `CreditIndicator.tsx`, `ChatPanel.tsx`, `TrackerPanel.tsx`, `JobFeedPanel.tsx`, `Navbar.tsx` and the job-feed lib. Read them fresh, do not undo earlier changes.

B22 (landing page still shows Karko AI screenshots) is **not yours**: it needs new product screenshots captured on staging, which the reviewer will do. Skip it.

Order: B20, B24, B27, B25, B26, B29, B28, B21.

---

## B20. Auth pages carry the wrong browser title (P2)

`src/app/auth/layout.tsx:4` sets `title: 'Sign In | Useful Apply'` while `src/app/layout.tsx:30` already has a title template that appends `| Useful Apply`, hence "Sign In | Useful Apply | Useful Apply" on every auth page. Fix: the auth layout should not set a page title at all; each auth page (`login`, `signup`, `forgot-password`, `reset-password`, `auth-code-error`, `callback`) exports its own `metadata.title` as the bare page name ("Sign In", "Create Account", "Forgot Password", "Reset Password", ...) so the root template produces "Sign In | Useful Apply". If a page is a client component and cannot export metadata, add a tiny server `layout.tsx` beside it or use a `generateMetadata` in the nearest server file. Verify with `npm run dev` and `curl -s http://localhost:3000/auth/signup | grep -o "<title>[^<]*"` for each page.

## B24. "1 credits" (P3)

`src/components/ui/CreditIndicator.tsx:~138` and any other place the chip renders "credits". Handle singular. Half credits stay plural ("0.5 credits"). Verify by grepping every `credits` string in the component and listing the outputs for 0, 0.5, 1, 1.5, 2.

## B27. "Enterprise Saas" and "Consumer Saas" (P3)

`src/components/job-feed/AISearchProfileCard.tsx:~207-256` uses Tailwind `capitalize` on values that come from the model in lowercase, so "saas" becomes "Saas". Fix at render: a small display helper that title-cases words but keeps a short allowlist intact (SaaS, B2B, B2C, AI, ML, API, UX, UI, IoT, SEO, CRM, ERP, HR, IT, DevOps, FinTech, HealthTech, EdTech). Apply it where `capitalize` is used on model-provided text in that card, and drop the CSS class there. Do not touch the model prompt or the stored data. Verify by pasting the helper's output for "enterprise saas", "b2b saas", "product management".

## B25. Generated screening answers contain em dashes (P3)

`src/app/api/chat/route.ts` (screening mode system prompt from ~line 212, note the prompt itself uses em dashes at ~199, ~257, ~259). Two changes: (1) add the same punctuation hard rule the other prompts already carry (see `src/lib/agents/prompts/email-prompts.ts:98` for the exact wording; copy it, do not paraphrase) to the screening system prompt and to the general chat system prompt in that file; (2) remove the em dashes from the prompt text itself so the model is not shown the pattern it is told not to use. Also check `src/lib/agents/prompts/cv-prompt.ts` and `cover-letter-prompt.ts` carry the rule; if one does not, add it. Do not change any other prompt content. Verify by grepping U+2014 across `src/lib/agents/prompts` and `src/app/api/chat/route.ts` and pasting the remaining hits (only allowed inside the rule text that shows the forbidden character).

## B26. Recent Applications shows company only, US date format (P3)

`src/components/chat/ChatHistory.tsx:~42-74`. Show role title and company ("Product Manager · Pixellot"), and format the date with the user's locale and a short month ("18 Aug 2026" style, `toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })`). Verify by describing the rendered line for a session with and without a job title.

## B29. Right panel truncates the job title after a feed-card action (P3)

`src/components/ChatPanel.tsx:~705` renders `currentSession?.jobTitle`. Starting Check Fit from a feed card titled "Product Manager - B2B SaaS" set the session `jobTitle` to "Product Manager". Find where the feed-card action creates the session and passes the title (feed-card action handler, `src/lib/job-feed/server.ts` or the API route it calls) and why it drops everything after " - ". Pass the full title. If the split exists to separate title from a subtitle for another display, keep that display and store the full title on the session. Verify by tracing the code path and stating the exact source of the truncation.

## B28. Sticky header overlaps section headings on jump-scroll (P3)

`src/components/marketing/Navbar.tsx:35` is `sticky top-3`. Anchor targets on the landing page (and features/pricing if they use in-page anchors) need `scroll-margin-top` at least the navbar height plus its offset. Prefer a single global rule for anchor targets (`[id] { scroll-margin-top: ... }` scoped to the marketing pages, or `scroll-mt-24` on the section elements that are jump targets). Verify by listing the anchor ids and where the margin now applies.

## B21. /features renders blank at several scroll positions (P2)

`src/app/features/page.tsx` uses `ScrollReveal` (`src/components/marketing/ScrollReveal.tsx`) heavily. Content is either mid-fade or never revealed at some scroll positions. Look at how `ScrollReveal` observes visibility (IntersectionObserver thresholds/rootMargin, whether it unobserves after reveal, whether it starts at `opacity-0` and never flips when the element is already in view on mount, or when the user jump-scrolls past it). Fix at the component so an element that has ever been in the viewport, or is above the current viewport, is revealed. Do not remove the animation entirely; make it robust. Verify with `npm run dev` on `/features` if you can drive a browser; otherwise describe the exact observer change and mark it for the reviewer.

---

When done, produce the report in the kickoff format for all eight bugs, then the Checks block (tsc, lint, git status) and Open questions.
