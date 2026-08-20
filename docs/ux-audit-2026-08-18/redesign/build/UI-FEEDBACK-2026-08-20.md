# UI feedback: Wasim's visual walk, 20 August 2026

Wasim walked the app on staging and reported what he saw, with screenshots.
Screenshots live in `ui-feedback/` next to this file. Each entry records what
he saw, what is wrong, and where it lives in the code.

**Status: collecting.** More batches may follow. When Wasim says the list is
complete, this file gets an implementation plan section and the fixes land
through the normal loop (tsc, lint, staging deploy, verify).

**Standing instruction from Wasim:** while fixing these, document and fix any
other UI, UX or wiring bug found along the way, and apply improvements where
a place clearly needs one.

**Sequencing (Wasim's call):** the landing image work (entry 2) goes last,
because the new captures must show the UI after these fixes land.

---

## 1. The landing nav is bare

- **Proof:** `ui-feedback/01-landing-nav.png`
- **Seen:** the top nav holds only "Pricing" and "Open app".
- **Wrong:** there is nothing else to orient a visitor. No About, no
  features anchor, no blog. Wasim asks: check what belongs there for this
  product and propose it.
- **Where:** the header in `src/app/page.tsx` (landing) and whatever shared
  marketing header `/pricing` uses.
- **Note for the plan:** About and Blog pages do not exist yet. The honest
  minimum is anchor links to sections that already exist on the landing
  (how it works / features, pricing) plus the imprint or contact the footer
  already carries. New pages are a product decision to put to Wasim, not
  something to invent.

## 2. Landing product images are small and soft

- **Proof:** none needed per Wasim; visible on the landing.
- **Seen:** the product shots (hero kit and the three moments) look blurry
  and too small at their rendered size.
- **Wrong:** resolution or compression is below the rendered size, so the
  product looks worse than it is. They should be bigger and sharp, in a
  format that stays light (WebP or AVIF at 2x the rendered size).
- **Where:** `src/app/page.tsx` (hero image plus `MOMENTS`),
  `public/images/moments/*.webp`.
- **Sequence:** LAST. The captures get retaken after the other UI fixes so
  the images show the corrected UI. The daily-feed moment is still the
  agreed placeholder until the end-to-end pass (see BACKEND-GAPS.md C1).

## 3. Scrollbar color fights the UI (FIXED)

- **Proof:** `ui-feedback/02-dashboard-pill-divider-toggle.png` (right edge),
  also visible in `03-tracker-next-column.png`.
- **Seen:** the scrollbar thumb is a heavy grey and turns navy on hover.
- **Wrong:** it is louder than any surface around it. Wasim wants a soft
  white-family thumb that fits the cream surfaces, stronger on hover.
- **Where:** `src/app/globals.css:83-141` (`::-webkit-scrollbar*` plus the
  Firefox fallback and `.scrollbar-on-dark`).

**Fixed** in `c081a756`. Thumb is `#E7E0D2` (soft white-family) at rest,
`#C9BDA4` deeper sand on hover, no navy anywhere. Firefox fallback follows.
The design system's scrollbar rule was rewritten in the same commit.

## 4. Canvas collapse toggle jumps around (FIXED)

- **Proof:** `ui-feedback/02-dashboard-pill-divider-toggle.png` (icon at the
  vertical middle of the canvas edge).
- **Seen:** with the canvas open, the toggle sits at the middle of the left
  edge. Collapsed, it sits at the top right.
- **Wrong:** the control moves between states. Wasim wants it in one
  consistent spot: bottom right of the canvas edge, in both states.
- **Where:** `src/components/shell/CanvasColumn.tsx:90-115` (the two
  branches around `onToggleCollapsed`).

**Fixed** in `bf1a2553`. The toggle sits at the bottom right in both
states: open it floats at the canvas's bottom-right corner, collapsed it
sits at the bottom of the rail, same pill style in both.

## 5. "New messages" pill shows when there are none (FIXED)

- **Proof:** `ui-feedback/02-dashboard-pill-divider-toggle.png` (pill above
  the composer on an empty New application).
- **Seen:** switching from the feed to a new application sometimes shows the
  "New messages" pill with nothing new. Intermittent; correct when a real
  message arrives.
- **Wrong:** the pill is the scroll-to-bottom button
  (`ChatPanel.tsx:1568-1578`, `showScrollButton`). ChatPanel stays mounted
  but hidden behind the feed, so its scroll state can go stale while
  hidden and read as "not at bottom" on return. Debug the cause; do not
  paper over it.
- **Where:** `src/components/ChatPanel.tsx` (`showScrollButton`, the scroll
  effects, and the view-switch path from `requestNewApplication`).

**Fixed** in `310c6e11`. Root cause confirmed: the panel stays mounted but
display:none behind the feed and tracker, where no scroll event fires and
every height reads 0, so `showScrollButton` froze at a stale "not at
bottom". A ResizeObserver now recomputes the button from the container's
geometry on reveal and on session change; nothing was hidden or papered
over.

## 6. A line sits above the chat box (FIXED)

- **Proof:** `ui-feedback/02-dashboard-pill-divider-toggle.png`.
- **Seen:** a full-width hairline separates the conversation from the
  composer.
- **Wrong:** Wasim wants no divider there. The composer's own rounded
  border should be the only separation.
- **Where:** `src/components/ChatPanel.tsx:1582` (`border-t border-cream-200`
  on the input area wrapper). Check the tracker and feed composers for the
  same line so all three match.

**Fixed** in `a128e407`. The border-t is gone from the chat, tracker and
feed composers alike; the composer's rounded border is the only separation.

## 7. The tracker NEXT column opens the wrong thing (FIXED)

- **Proof:** `ui-feedback/03-tracker-next-column.png` (status list open
  under "Follow up by 27 Aug").
- **Seen:** clicking "Follow up by 27 Aug" or "Follow up overdue" opens the
  status/date popover instead of going anywhere useful.
- **Wrong:** a follow-up line should take the user to that application's
  Emails tab, where the follow-up is drafted and sent. Today only
  `drafted` rows navigate (`openApplication`); every other status opens
  `StatusPopover` (`TrackerCanvas.tsx:325-357`).
- **Fix shape:** follow-up steps navigate to the application with the
  Emails tab active. Steps that genuinely are date edits (interview date,
  offer respond-by) keep the popover. Recheck every `deriveNextStep` label
  against what clicking it should do.
- **Where:** `src/components/tracker/TrackerCanvas.tsx` (NEXT cell),
  `src/components/tracker/tracker-status.ts` (`deriveNextStep`).

**Fixed** in `94cfb3be`. Every NEXT step now declares what a click does
(`opens` on `deriveNextStep`): Send it and all follow-up labels open the
application on the Emails tab through `openStoredSession`; Waiting, the
interview date and the offer respond-by keep the date popover; Rejected
stays inert. Label-by-label review recorded in `tracker-status.ts`.

## 8. Edit feed's Edit button leads to the retired documents page (FIXED)

- **Proof:** `ui-feedback/04-edit-feed-profile.png`.
- **Seen:** in Edit feed, Profile pill, the "Edit" button on "What I read
  from your CV" navigates to `/documents`, which still has the old
  pre-redesign UX.
- **Wrong, two parts:**
  1. The wiring: `FeedCanvas.tsx:106` sends Edit to `router.push('/documents')`.
  2. The page: `/documents` is old UX and should not exist. Wasim's call:
     remove the documents page entirely and move CV upload/replace into
     the settings modal (a CV or Documents row/pane, wherever it honestly
     fits), then point this Edit button and anything else that links to
     `/documents` at the new home.
- **Where:** `src/components/job-feed/FeedCanvas.tsx:106`,
  `src/app/documents/**`, `src/components/settings/**`, plus a grep for
  every `/documents` reference before deleting.
- **Also check:** Wasim flagged possible bugs inside Edit feed's three
  pills (Profile, Searches, Preferences), for example whether Searches
  reflects the current plan or the first run's plan. Verify each pill
  renders live data.

## 9. Settings panes are cropped at the top (FIXED)

- **Proof:** `ui-feedback/05-settings-padding.png`.
- **Seen:** the "General" title sits nearly against the top edge of the
  modal. Other panes share the problem.
- **Wrong:** the top padding is below any standard. Give the pane header a
  consistent padding matched to the rest of the modal's spacing scale, on
  every pane.
- **Where:** `src/components/settings/SettingsModal.tsx` and the pane
  components (`GeneralPane`, `UsageBillingPane`, `NotificationsPane`).

**Fixed** in `7128bf09`. The scroll container carries one header padding
(`pt-7` desktop) for all three panes; the mobile pill row got matching space.

## 10. Auth state flashes on the landing and into the app

- **Proof:** none; timing bug, reproduce by revisiting the landing while
  signed in.
- **Seen, two flashes:** the landing CTA renders "Try it free" for a few
  hundred milliseconds before flipping to "Open app". Then clicking
  "Open app" shows the anonymous upload view briefly before the dashboard
  appears.
- **Wrong:** both surfaces render the signed-out default before the session
  has resolved, instead of holding a neutral state. Find the cause and fix
  it at the root: gate the CTA and the dashboard's first paint on auth
  resolution, without making the signed-out visitor wait.
- **Where:** the landing CTA in `src/app/page.tsx` (or its header
  component), `src/contexts/AuthContext.tsx`, and the dashboard's initial
  view logic in `src/app/dashboard/page.tsx` / `GuidedLine`.

## 11. No consistent global font (FIXED)

- **Proof:** visible everywhere; compare the serif titles ("Tracker",
  "General", "How I search for you") against the sans body and the mixed
  weights across panes.
- **Seen:** titles, body and labels mix font families across the app. It
  reads inconsistent.
- **Wasim's call:** pick ONE professional, readable font and standardize it
  globally, the kind professionally built software uses (he names Cursor as
  the reference; Cursor and most modern tools use Inter or a close
  system-sans stack). Remove the inconsistency.
- **Scope notes for the plan:**
  - Today the design system pairs Georgia (headers) with Arial (body), so
    the serif/sans split is currently deliberate. This entry supersedes
    that: the app UI moves to one family. `.claude/rules/design-system.md`
    must be updated in the same change or every later UI task will
    reintroduce the serif.
  - The CV templates are exempt. They render the applicant's document and
    use Arial + Georgia as ATS-safe system fonts
    (`src/components/cv-templates/**`). The exported PDF must not change.
  - Landing and app should share the same family so the brand does not
    split at the login line.
- **Where:** the font setup in `src/app/layout.tsx` and
  `src/app/globals.css` (font-family tokens, any `font-serif` /
  Georgia usage across `src/components/**`), `.claude/rules/design-system.md`.

**Fixed** in `ce2e6bec`. Inter loads through next/font and drives
`--font-sans`; every `font-serif` heading is gone from the app and landing.
The unused Geist fonts were removed too (they were loaded but nothing
referenced them). CV templates, exported documents and the Plus Jakarta
wordmark keep their fonts. Design system typography section updated in the
same commit. Found along the way: `--font-sans` named Inter but nothing
loaded it, so the whole app was actually rendering the OS system font.

---

## Not yet documented

Wasim will send more batches. Append them here with the same format.
