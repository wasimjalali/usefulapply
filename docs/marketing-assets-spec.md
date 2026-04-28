# Marketing Assets Spec — Screenshots + GPT Image 2 Prompts

Date: 2026-04-27
Purpose: exact list of every visual asset needed for the Karko marketing redesign. You capture / generate, drop in the folders below, I reference them in the design plan.

## Folders

```
docs/screenshots/   ← real product screenshots (PNG)
docs/images/        ← generated illustrations and textures (PNG)
```

## General capture rules (for every screenshot)

- **Browser width**: set Chrome to 1440 × 900 (or any consistent desktop width, just use the same one for all). If your 27" display is bigger, use 1440 × 900 specifically so the framing is tight.
- **Mode**: logged in as `wasimjalali2004@gmail.com` on production `karkoai.com`.
- **No visible**: browser dev tools, browser bookmarks, notification banners, "Workflow failed" toasts, dev tools panel.
- **Save format**: PNG, saved as `docs/screenshots/<filename>.png`.
- **Crop**: take the viewport as-is. I'll crop in the design plan if needed.
- **Clean state**: wait 2-3 seconds after each page loads so skeletons resolve.

Use the filenames **exactly as written**. The design plan references these names.

---

## SCREENSHOTS (10 total)

Status key: ✅ already have it · 📸 need you to capture

---

### 01 · 📸 `01-smart-job-feed-populated.png`

**Where:** Dashboard → Job Feed tab.
**What should be visible:** The "6 jobs for you today" header, "Senior Product Manager, Lead Product Manager · United States" subhead, delivery time, "Today / Saved" tabs, "Edit feed" and refresh buttons. Then 3 job cards fully visible (Strong match / Strong match / Good match). Each card shows the match label pill, title, company, location chips, "Apply with Karko" button, "Employer site" link, "View details".
**How to frame:** scroll to top of the feed panel so the "6 jobs for you today" header is at the top of the screenshot. The right-side chat panel with "Ready to apply?" is fine to include, but make sure the left feed panel takes most of the width.

---

### 02 · 📸 `02-job-detail-modal.png`

**Where:** Dashboard → Job Feed → click "View details" on the first job card (SoFi, Senior Product Manager).
**What should be visible:** The full modal open. Header with match label (Strong match), job title, company. Below: Role details section (full JD text), Apply via section (Apply with Karko + Employer site + Copy). If the "Match-quality feedback" prompt is visible, include it.
**How to frame:** modal centered, background dimmed. Full modal height in viewport; if it's too tall, scroll so the header + apply buttons are visible.

---

### 03 · 📸 `03-application-kit-generated.png`

**Where:** Dashboard → Application Kit tab → after an Apply Directly generation **finishes**.
**What should be visible:** Left panel shows the tailored CV (Alex Morgan CV is fine). Chat panel on the right shows the completion state, something like "Your application is ready" or the three action chips (Download PDF / View Cover Letter / View Email). CV / Cover Letter / Email tabs visible at the top of the left panel.
**How to do it:**
1. Go to Application Kit
2. Paste the Uber Product Ops JD I gave you earlier into the chat input
3. Click "Apply Directly"
4. Wait for the full generation to complete (CV redrawn, cover letter + email ready)
5. Capture the final state with the tailored CV visible

If a job is already generated and showing tailored content, use that instead — no need to burn credits.

---

### 03b · 📸 `03b-application-kit-generating.png` **(THIS IS THE ONE I NEED TO JUDGE)**

**Where:** Dashboard → Application Kit tab → **during** an Apply Directly generation (the loading/streaming state).
**What should be visible:** The chat panel on the right showing the AI working — loading indicators, streaming text, progress steps, whatever the generation flow currently looks like. Left panel may show the old CV or a loading state.
**How to do it:**
1. Paste a JD into chat
2. Click "Apply Directly"
3. **While it's generating** (before it finishes), take the screenshot
4. If it's too fast, pause with your screenshot tool the moment you see loading UI

This is the screenshot I'll use to critique the generation-flow UI. I will judge honestly whether it's premium or AI-slop. If AI-slop, I'll include a redesign spec in the design plan and we'll retake this one after redesigning.

---

### 04 · 📸 `04-fit-analysis-result.png`

**Where:** Dashboard → Application Kit → Analyze Fit First result.
**What should be visible:** The fit analysis card in the chat panel. Match score percentage (big number), skill gaps list, recommendation text, "Continue to full application" CTA.
**How to do it:**
1. Paste the Uber JD
2. Click "Analyze Fit First" (costs 0.5 credits)
3. Wait for the analysis to finish
4. Capture the result card

---

### 05 · 📸 `05-application-tracker.png`

**Where:** Dashboard → Tracker tab.
**What should be visible:** The tracker table with your 6 tracked applications. Status filter tabs at top ("6 ALL / 6 APPLIED / 0 INTERVIEW / 0 FOLLOW-UP SENT / 0 REJECTED / 0 ACCEPTED"). Search + "All Statuses" dropdown. Table rows: Job position, Company, Date saved, Match score, Status. All 6 rows visible if possible.
**How to frame:** scroll so the "6 ALL" tab is at the top and all 6 rows are visible. This is the hero shot for the Tracker feature card.

---

### 06 · 📸 `06-job-feed-onboarding.png`

**Where:** Dashboard → Job Feed → click "Edit feed" button.
**What should be visible:** The onboarding wizard, Step 1 ("What jobs are you looking for?") with Roles, Countries, and Cities filled in. "Step 1 of 4" indicator at top. If CV import section is visible ("Take from my CV" button), include it.
**How to frame:** full modal/drawer visible, step indicator at top, Save button at bottom if it fits.

---

### 07 · ✅ `07-documents-page.png`

**Status**: already captured. Shows Primary CV + Profile Photo + Master CV cards.

---

### 08 · 📸 `08-cv-template-chooser.png`

**Where:** Dashboard → Application Kit → CV tab → click the "Templates" dropdown button (top-left of the CV panel).
**What should be visible:** The dropdown open, showing all 6 template previews (Premium ATS, Modern Professional, Executive, German ATS, German Classic, Classic Green). Each should have a small preview thumbnail and name visible.
**How to frame:** make sure all 6 templates are in the screenshot, even if you have to scroll the dropdown.

---

### 09 · 📸 `09-credit-indicator-expanded.png`

**Where:** Dashboard (any tab) → click the "210 credits" chip in the top nav.
**What should be visible:** The dropdown open showing:
- "Credits Remaining" with breakdown (Monthly / Rollover / Add-on)
- "Credit Usage" list (Fit Analysis 0.5 / Full Application 2 / Cover Letter Regen 0.5 / Email Regen 0.5)
- "Buy More Credits" and "Manage Subscription" buttons

---

### 10 · 📸 `10-dashboard-top-nav.png`

**Where:** Dashboard (any tab).
**What should be visible:** Just the top nav strip — Karko logo, Application Kit / Job Feed (with "6" badge) / Tracker tabs, Upgrade to Max button, 210 credits chip, history/add icons, Profile PLUS badge.
**How to do it:** take a full screenshot, then crop to just the top ~80-100 pixels (the nav bar). If easier, use macOS screenshot Cmd+Shift+4 → drag a thin horizontal strip across the nav.

---

## BONUS SCREENSHOT (optional, nice to have)

### 11 · 📸 `11-job-feed-empty-upsell.png` (optional)

**Where:** Log out, go to `karkoai.com`, click "Try It Free" or similar → go to dashboard as a signed-out user → Job Feed tab.
**What should be visible:** The "Get jobs picked for you, every morning" upgrade gate with preview jobs in the background. This is the conversion surface for signed-out visitors.
**Skip if annoying** — only useful if it's easy to get logged out without breaking your session.

---

## GPT IMAGE 2 GENERATED IMAGES (5-8 total)

Save generated images as PNG in `docs/images/<filename>.png`. For each prompt, use GPT Image 2 at **high quality (~$0.21 per image)** and **1024×1024 or 1024×1792 portrait** as noted per image.

**Shared style foundation** — paste this as the first line of every prompt so all images look like one set:

> Style: Premium warm editorial illustration, soft paper-textured cream background (#FAF7F2), navy blue accents (#1E3A5F), gold accents (#D4A93A), flat vector geometry with gentle shadows, modern magazine aesthetic, no text, no gradients, no 3D render, no generic stock-photo look. Think "New York Times" editorial plus "Airbnb Design" illustration. Warm, calm, confident, not playful.

---

### Image 01 · `hero-background-texture.png`

**Size:** 1440×900 wide (use the closest GPT Image 2 preset, crop if needed).
**Prompt:**
```
[Shared style foundation above]

A wide cream paper texture background for a website hero section. Barely visible paper fiber grain, soft gold glow in the top-right corner (like morning sun on paper), and a very faint navy dot grid pattern across the whole surface. No illustrations, no objects, no text. Just atmosphere. Should feel like opening a premium printed magazine.
```

**Usage:** Home page hero section background (subtle overlay under headline text).

---

### Image 02 · `two-pillar-job-feed.png`

**Size:** 1024×1024 square.
**Prompt:**
```
[Shared style foundation above]

A calm editorial illustration of a floating stack of 3 index cards, each card representing a hand-picked job listing. Each card shows a simple abstracted company logo silhouette, a job title bar, a match quality indicator dot (green for strong, amber for good), and location chip. The cards are slightly staggered in mid-air as if being gently delivered. A small compass symbol in gold floats above the top card. The scene sits on a cream paper background. Soft morning light from the upper left. No text. No human figures. Compositional focus: the top card is crisp; the ones behind fade into soft depth.
```

**Usage:** Home page "Two pillars" band — left side, representing Smart Job Feed.

---

### Image 03 · `two-pillar-application-kit.png`

**Size:** 1024×1024 square.
**Prompt:**
```
> Style: Premium warm editorial illustration, soft paper-textured cream background (#FAF7F2), navy blue accents (#1E3A5F), gold accents (#D4A93A), flat vector geometry with gentle shadows, modern magazine aesthetic, no text, no gradients, no 3D render, no generic stock-photo look. Think "New York Times" editorial plus "Airbnb Design" illustration. Warm, calm, confident, not playful.

A calm editorial illustration of a stack of four document sheets fanned out slightly: a CV (top, with visible but abstracted section bars), a cover letter behind it, an application email envelope, and a follow-up email envelope at the back. A thin gold thread connects all four documents, suggesting they are part of one package. A small Karko "K" icon in navy appears as a seal in the top right of the CV. Cream paper background. Soft warm shadow under the stack. No text, no real words, just the suggestion of structure. Editorial, premium, not corporate.
```

**Usage:** Home page "Two pillars" band — right side, representing Application Kit.

---

### Image 04 · `workflow-5-steps.png`

**Size:** 1792×1024 wide (landscape).
**Prompt:**
```
> Style: Premium warm editorial illustration, soft paper-textured cream background (#FAF7F2), navy blue accents (#1E3A5F), gold accents (#D4A93A), flat vector geometry with gentle shadows, modern magazine aesthetic, no text, no gradients, no 3D render, no generic stock-photo look. Think "New York Times" editorial plus "Airbnb Design" illustration. Warm, calm, confident, not playful.


A horizontal flow illustration showing 5 steps of a job search workflow, connected by a thin navy line with gold dot markers. Each step is a small editorial icon:
1. A paper CV being uploaded (upward arrow)
2. A compass finding a job card (job discovery)
3. A magnifying glass over a match score circle (fit analysis)
4. A quill writing on a document (application generation)
5. A checklist with checkmarks (tracking applications)

The 5 icons are evenly spaced across the width. Cream paper background. All icons share the same flat geometric vector style. The line connecting them has small animated-looking dashes. No text labels, only icons. Scene feels like a map of the user's job search.
```

**Usage:** Home page "How It Works" section — illustrated timeline above or beside the step cards.

---

### Image 05 · `empty-state-tracker.png`

**Size:** 1024×1024 square.
**Prompt:**
```
> Style: Premium warm editorial illustration, soft paper-textured cream background (#FAF7F2), navy blue accents (#1E3A5F), gold accents (#D4A93A), flat vector geometry with gentle shadows, modern magazine aesthetic, no text, no gradients, no 3D render, no generic stock-photo look. Think "New York Times" editorial plus "Airbnb Design" illustration. Warm, calm, confident, not playful.

A minimal editorial illustration of an empty clipboard or open notebook lying flat on a cream paper surface. A small pencil rests on top. A faint grid of empty rows suggests "applications waiting to be filled in." A single gold sticky-note flag marks the first empty row. Soft warm shadow. Negative space generous. Calm, inviting, not sad. This is the empty state for an application tracker that will soon have entries.
```

**Usage:** Empty state for Application Tracker feature card on Features page, or landing-page tracker preview if user has zero applications.

---

### Image 06 · `founder-portrait-placeholder.png` (optional — only if we don't have a real founder photo)

**Size:** 1024×1024 square.
**Prompt:**
```
> Style: Premium warm editorial illustration, soft paper-textured cream background (#FAF7F2), navy blue accents (#1E3A5F), gold accents (#D4A93A), flat vector geometry with gentle shadows, modern magazine aesthetic, no text, no gradients, no 3D render, no generic stock-photo look. Think "New York Times" editorial plus "Airbnb Design" illustration. Warm, calm, confident, not playful.

An editorial abstract portrait silhouette of a founder at a laptop in a home office. The figure is seen from behind, over-shoulder angle, so their face is not visible. The laptop screen shows soft geometric shapes that suggest a dashboard. Warm morning light through a window on the left. Cream walls. A single small plant on the desk. A framed certificate on the wall in the background (just a rectangle, no text). No faces, no identifying features. Mood: focused, quiet, real.
```

**Usage:** Founder story section on home page, if a real photo is not available. **Skip this prompt if you want to use a real photo of yourself** — a real founder photo always beats an illustration for trust.

---

### Image 07 · `cta-background-navy.png`

**Size:** 1440×600 wide banner.
**Prompt:**
```
> Style: Premium warm editorial illustration, soft paper-textured cream background (#FAF7F2), navy blue accents (#1E3A5F), gold accents (#D4A93A), flat vector geometry with gentle shadows, modern magazine aesthetic, no text, no gradients, no 3D render, no generic stock-photo look. Think "New York Times" editorial plus "Airbnb Design" illustration. Warm, calm, confident, not playful.

A wide dark navy (#1E3A5F) background with a subtle warm gold dot grid overlay, and very soft gold radial glow emanating from the bottom-left corner. Paper texture barely visible but present. No illustrations, no objects, no text. Feels like the inside cover of a hardback book. The overall mood is confident, premium, not intimidating.
```

**Usage:** Full-width CTA band at the bottom of the home page ("Your job search lives here now").

---

### Image 08 · `comparison-page-hero.png` (optional)

**Size:** 1024×1024 square.
**Prompt:**
```
> Style: Premium warm editorial illustration, soft paper-textured cream background (#FAF7F2), navy blue accents (#1E3A5F), gold accents (#D4A93A), flat vector geometry with gentle shadows, modern magazine aesthetic, no text, no gradients, no 3D render, no generic stock-photo look. Think "New York Times" editorial plus "Airbnb Design" illustration. Warm, calm, confident, not playful.

A minimal editorial illustration of two small flags on wooden stakes standing side by side on a cream paper map. One flag (on the left) is larger, gold, with a small "K" mark. The other flag (on the right) is smaller, navy, blank. Between them, a dotted path leads forward. The scene suggests comparison without being adversarial — it's about choice, not combat. Soft shadows. Generous negative space. No text.
```

**Usage:** Hero illustration for the 6 comparison pages (Teal, Jobscan, Rezi, Kickresume, Enhancv, Resume.io).

---

## OPTIONAL: Try the "8 coherent images from one prompt" feature

GPT Image 2 can return up to 8 images in one call with shared style consistency. If you want to try that:

**Prompt:**
```
> Style: Premium warm editorial illustration, soft paper-textured cream background (#FAF7F2), navy blue accents (#1E3A5F), gold accents (#D4A93A), flat vector geometry with gentle shadows, modern magazine aesthetic, no text, no gradients, no 3D render, no generic stock-photo look. Think "New York Times" editorial plus "Airbnb Design" illustration. Warm, calm, confident, not playful.

Generate 8 coherent editorial illustrations for a job application platform called Karko, all in the exact same flat vector style, cream paper background, navy and gold accents, no text:

1. A compass finding a card labeled with a gold dot
2. A fanned stack of four documents connected by a gold thread
3. A magnifying glass over a percentage circle
4. An upload arrow with a single paper CV floating upward
5. A clipboard with checkmarks in gold
6. A morning sun rising over a neat desk with a laptop
7. A small envelope with a gold wax seal
8. A bar chart with three bars in rising heights, topped by a gold dot

All eight must share identical lighting, color palette, line weight, and shadow style. This is a brand illustration set.
```

Then save the 8 outputs as `brand-set-01.png` through `brand-set-08.png` in `docs/images/`.

---

## Summary

**You do:**
- Capture 8-9 screenshots per the spec above (filenames matter).
- Generate 5-7 images via GPT Image 2 with your account.
- Drop all files into the right folders.

**I do:**
- Write the design plan referencing these filenames.
- Critique the generation-flow UI once I see `03b-application-kit-generating.png` and propose redesign if needed.
- Finalize the content + design plans for sequential execution.

Ping me when the folders are populated. No rush — I'll be writing the design plan in parallel.
