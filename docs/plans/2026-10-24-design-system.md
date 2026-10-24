# Plan: role-based design system and dark mode (2026-10-24)

Wasim's decision: keep the Useful Apply palette (navy, cream, gold). Borrow the structure of the
Useful brand system, not its colors: color tokens named by role, one radius scale by role,
hairline borders, a one-step lift for cards, motion from tokens only. Then add dark mode. No
"by Useful" family mark.

Each PR below runs as its own cloud session (global rules, "Cloud or local"), launched from main
by the local orchestrator. Every cloud PR ends reviewed and green with the `needs-local` label and
the Local handoff section. The cloud never merges or deploys. The local orchestrator merges, deploys
and checks production.

Order: PR 1 alone. After it merges, PRs 2, 3 and 4 in parallel. After those merge, PR 5. After
PR 5 merges, PR 6.

## Facts (main at 94af4570, 2026-10-24)

- 110 component files use palette-named color classes about 2,700 times (`bg-cream-50`,
  `text-navy-900`...). About 370 of them are raw `white`, `black` or `gray`. About 100 hex literals
  and 91 inline `style` colors sit outside the CV templates and exports. There are no `dark:`
  classes.
- Tokens live in `src/app/globals.css` under `@theme`: navy 50-900, cream 50-400, gold 50-700,
  sage 50-700, `charcoal`, `warm-gray`, shadows `--shadow-sm/md/lg/xl`, `--shadow-glow-gold`,
  easings `--ease-out-quart` and `--ease-spring`.
- `.claude/rules/design-system.md` already names surface roles (Canvas `cream-100`, Surface
  `cream-50`, Document `white`), a radius scale (Pill `rounded-full`, Control `rounded-lg`, Card
  `rounded-2xl`, Modal `rounded-[24px]`) and a shadow scale (Resting `shadow-sm`, Elevated
  `shadow-md`, Floating `shadow-lg`). This plan turns those into tokens and enforces them.
- Navy is both text and a dark surface, so remapping the palette can't give dark mode. Each use
  has to move to the role it plays.
- These counts are from 2026-10-24. Re-count before relying on them.
- Out of scope in every PR: `src/components/cv-templates/**`, `src/lib/cv-templates/**`,
  `src/lib/services/export/**`, email templates, `opengraph-image`, icons. Documents are white paper
  in both themes.

## Shared rules for every PR

- **Tokens:** role variables live on `:root` in `globals.css` and are exposed to Tailwind through
  `@theme inline` (`--color-surface: var(--surface)` and so on). Dark mode later overrides only the
  variables (`:root[data-theme="dark"]`).
- **Cloud setup:** run `npm ci`, `npx playwright install chromium ffmpeg` and
  `CI=1 npx wrangler d1 migrations apply usefulapply-db --local`. Export `PW_CHANNEL=chromium`
  for every Playwright run: there is no Google Chrome in the cloud, and the config defaults to it.
  E2E runs without local secret files: PR 0 added a test-only auth secret fallback in
  `e2e/lib/env.ts`. `npm run test:e2e` sets `E2E_MCP=1` itself; a single project run needs it set
  by hand for the mcp lanes.
- **Visual check (PRs 1 to 4: no visible change):** the `visual` Playwright project from PR 1
  (`e2e/visual/screens.spec.ts`) screenshots every screen in the list below at 1280x900 and
  768x1024 with `toHaveScreenshot` and `maxDiffPixels: 0`. It runs on the data lane's preview
  (`E2E_WRANGLER`, `PREVIEW_PORT`) and seeds through the existing helpers (`e2e/lib/user.ts`,
  `e2e/lib/model-script.ts` with `e2e/fake-anthropic.ts`). The clock is frozen with
  `page.clock.install` at 2026-10-24T09:00:00Z, and animations and the caret are off.
  - **Snapshots are committed** under `e2e/visual/__screenshots__/` and are Linux-only (Playwright
    names them per platform). On macOS the `visual` project is skipped, so the Mac never compares
    against Linux renders.
  - **PR 1 makes the baseline:**
    1. `git worktree add ../base <merge-base>`, then `npm ci` and `npx opennextjs-cloudflare build`
       there.
    2. Copy PR 1's `e2e/visual/`, its `playwright.config.ts` and any new `e2e/lib/` helper into
       that worktree, uncommitted. The base commit doesn't have them yet.
    3. Run `PW_CHANNEL=chromium npx playwright test --project=visual --update-snapshots` there,
       then copy `e2e/visual/__screenshots__/` back into the PR.
    4. Run the head against them in the PR worktree. Run the two one after the other, never at
       once, because they use the same ports. Remove the base worktree afterwards.
  - A diff on a screen your PR didn't touch means the VM renders differently (fonts, Chromium):
    report it in the PR body, and don't change code to hide it.
  - **PRs 2 to 4 compare** against the committed snapshots. They never update them.
  - **Report:** paste the result into the PR body. Any difference is a bug, unless you name it in
    the PR body with a before and after crop.
- **Screens:**
  - landing `/`, `/pricing`, the GEO page `/ai-job-application/cover-letter-generator`;
  - sign-in and sign-up;
  - the dashboard: empty, with chat and a kit, and with the canvas on each tab (CV, Cover letter,
    Emails);
  - `/applications` (tracker);
  - the job feed: setup, then results;
  - `/settings`;
  - one dialog (delete application);
  - toasts: success and error.
- **Checks in every PR:**
  - `npx tsc --noEmit`: 0 errors;
  - `npm run lint`: 0 errors, the token check included;
  - `npm test`;
  - the visual spec;
  - the full `npm run test:e2e`.

  Paste each command's output tail into the PR body.
- **Review:** the Features row. Sonnet (`sonnet-sweeper`, high) plus Opus in GPT's slot, at high
  effort. Every file goes to one reviewer. Fix every finding, lows included; at most 3 rounds.
- **Commit and push work in progress often.**
- **Voice:** any user-facing copy follows the global Voice rules.

## PR 0 (local, by the orchestrator): this plan and E2E without local secrets

This file, plus a test-only auth secret fallback (`FALLBACK_SECRET_VARS` in `e2e/lib/env.ts`,
used by `playwright.config.ts` and `e2e/mcp-oauth.spec.ts`) for when the local secrets file is
missing. Small-PR review row. Lands on main before PR 1.

## PR 1: token foundation, no visible change

**Goal:** add role tokens and the guardrails. Migrate nothing.

**The work**
1. **Color roles** in `globals.css`, mapped to today's values:
   - ground: `canvas` (cream-100), `surface` (cream-50), `document` (white, constant in both
     themes), `sunken` (cream-200);
   - ink: `ink` (the main text navy), `ink-muted` (warm-gray), `ink-faint`, `ink-inverse` (text on
     navy);
   - brand: `brand` (navy-600), `brand-strong`, `brand-ink` (text on brand: white in light mode);
   - accent: `accent` (gold-400), `accent-strong` (gold-500), `accent-soft` (gold-50/100, keeps
     dark text), `accent-ink` (text on gold: white in light mode, as design-system.md requires);
   - lines: `border` (cream-200), `border-strong` (cream-300, dividers only, per
     design-system.md);
   - status: `success`, `success-soft`, `warning`, `warning-soft`, `danger`, `danger-soft`;
   - `focus-ring`;
   - a dark-surface pair for the navy panels (`surface-inverse`, `border-inverse`).

   Read how every palette color is used across `src/components` and `src/app` before naming
   roles, so PRs 2 to 4 find a role for every use. Add a role only when it's used.
2. **Radius roles:** `--radius-pill`, `--radius-control`, `--radius-card`, `--radius-modal`. Map
   them to today's `rounded-full`, `rounded-lg`, `rounded-2xl` and `rounded-[24px]`.
3. **Shadow roles:** `resting`, `elevated`, `floating` (the current sm, md, lg). The one-step card
   lift in PR 5 is `resting` to `elevated`, so there's no separate lift role.
4. **Motion roles:** `--ease-standard` (the current out-quart), `--ease-pop` (spring, for pop
   moments only), and `--duration-fast` and `--duration-base`.
5. **Token check:** `scripts/check-design-tokens.mjs`, run inside `npm run lint`. It flags:
   - palette-named color classes (`navy-*`, `cream-*`, `gold-*`, `sage-*`, `charcoal`,
     `warm-gray`, `white`, `black`, `gray-*`, `slate-*`);
   - hex and `rgb()` colors in `.tsx` and inline styles;
   - radius classes outside the roles;
   - gradient utilities and `*-gradient(` values (PR 5 removes them; until then they're in the
     baseline).

   It scans `src/components/**`, `src/app/**` and `src/lib/blog/**` only, the same paths PRs 2
   to 4 own, so every baseline entry has an owner.

   Out-of-scope paths are skipped. Today's hits go in a committed baseline file
   (`scripts/design-token-baseline.json`), so lint passes now. Its format: one key per file path,
   sorted, each holding a count per rule (`{"src/x.tsx": {"color-class": 12}}`), one entry per
   line, never line numbers. That keeps parallel edits in PRs 2 to 4 easy to merge. The check fails on any new hit,
   and on any hit removed from the code but still listed in the baseline (that keeps the baseline
   shrinking).
6. **The visual spec** and its fixtures (see Shared rules).
7. **Docs:** update `.claude/rules/design-system.md` (roles first, palette names only as their
   values) and `.claude/agents/karko-ui-designer.md`.

**Config:** the `visual` project needs the data lane's servers, so change the server gate to
`needs('data', 'visual')` for the fake model and the data preview.

**Owns:** `src/app/globals.css`, `scripts/check-design-tokens.mjs`,
`scripts/design-token-baseline.json`, `package.json` (the lint script only), `e2e/visual/**`, the
`visual` project in `playwright.config.ts`, any new helper under `e2e/lib/`, the two docs above.

**Done when:** the visual spec shows 0 pixel difference against the base, and the token check runs
in lint.

## PRs 2, 3, 4: migration by area, no visible change (after PR 1 merges, in parallel)

**The work** (same in each)
- Replace palette classes, hex and inline colors with role tokens.
- Replace radius classes with the radius roles.
- Replace shadow strings and inline easings with the shadow and motion roles.
- Remove each area's entries from the token baseline.
- Change no behaviour.

**Areas** (each PR owns only its files; the baseline file is edited by each, so expect small merge
conflicts there and resolve them by re-running the check). A use with no fitting role gets a new
role appended at the end of the role block in `globals.css`, in a comment-marked group for that
PR, and nothing else in `globals.css` changes.
- **PR 2, shell, dashboard and chat:** `src/components/shell/**`, `src/components/chat/**`,
  `ChatPanel.tsx`, `AgentProgressV2.tsx`, `MarkdownText.tsx`, `StepIndicator.tsx`,
  `src/app/dashboard/**`, `src/components/ui/**`.
- **PR 3, canvas and workspace:** `CVPanel.tsx`, `EditableCVCanvas.tsx`, `CoverLetterPanel.tsx`,
  `EmailPanel.tsx`, `CVInputZone.tsx`, `FileUpload.tsx`, `KitDocumentError.tsx`,
  `src/components/kit/**`, `src/components/tracker/**`, `src/components/job-feed/**`,
  `src/app/master-cv/**`, `src/app/master-cv-template/**`, `src/app/profile/**`.
- **PR 4, everything else:** `src/components/marketing/**`, `blog/**`, `comparisons/**`, `auth/**`,
  `oauth/**`, `settings/**`, `BrandLogo.tsx`, `ChunkReloadGuard.tsx`, `ScrollbarReveal.tsx`,
  `src/lib/blog/**`, and everything under `src/components` and `src/app` not named above,
  including `*.css` files (landing, pricing, about, legal, GEO, settings, account, subscription,
  notifications, MCP pages, `admin-dashboard` and its CSS, `page.tsx`, error pages).

**Done when:** the visual spec shows 0 difference, and the area's baseline entries are gone. PR 4
also empties the baseline, switches the check to enforce with no baseline, and deletes the file.

## PR 5: the discipline pass, a visible change (after PRs 2 to 4 merge)

Wasim chose to adopt these from the Useful brand system, so this PR also updates
`.claude/rules/design-system.md` to match. Where the old rules differ, the new rules below win.

**The work**
- Hairline borders only: 1px, from `border`; `border-strong` only for dividers.
- The one-step lift: static cards rest on `resting` with no hover change. Interactive cards (they
  open, select or navigate) rise one step to `elevated` on hover, with no translate. The
  `-translate-y` lift stays reserved for elevated CTAs.
- Radius exactly by role everywhere.
- One easing for structure (`ease-standard`) and `ease-pop` for pop moments only (dialogs, ticks,
  badges). Durations come from tokens.
- No gradients anywhere (CTAs included, as the CTA rules already say), and no translucent whites
  over cream. Fix the rules doc's surface section, which still says gradients are reserved for
  CTAs.

**Owns:** every file under `src/components` and `src/app` outside the out-of-scope list,
`src/app/globals.css`, `.claude/rules/design-system.md`, `.claude/agents/karko-ui-designer.md`,
`e2e/visual/**` (snapshots are updated in this PR, since the change is visible).

**Verify**
- The visual spec now shows differences. Attach before and after screenshots of every screen at
  both widths.
- Record motion (dialog open, card hover, toast) at 30 fps and review every frame.
- Have an Opus judge (a clean run: no rules, no skills, only the screenshots) compare before and
  after, and paste its verdict.
- Wasim gives his verdict on the PR before the local merge. This PR stops for him.

## PR 6: dark mode, a visible change (after PR 5 merges)

**The work**
- **Dark values** for every color role under `:root[data-theme="dark"]`, built from the navy
  family:
  - a deep navy canvas, with surfaces one tone step apart;
  - cream ink;
  - gold accent tuned for contrast on navy;
  - status colors readable on dark;
  - shadows replaced by tone steps and hairlines, since dark shadows don't read.
- **Documents stay white:** the CV page, the cover letter and email bodies, and exports. In dark
  mode they sit as a white sheet on a dark desk.
- **Owns:** the same files as PR 5, plus `playwright.config.ts` (the themed visual and axe runs),
  `package.json` and the lockfile for
  `@axe-core/playwright` (dev only), and `src/app/layout.tsx`.
- **A theme setting:** System, Light or Dark, in `/settings` (Appearance).
  - Stored in a cookie plus localStorage. No database change.
  - Applied before first paint, through an inline script in `layout.tsx` that reads the cookie, so
    there's no flash.
  - `color-scheme` is set for form controls and scrollbars.
- **Charts, status pills, toasts, the job feed and the marketing pages all get dark values.**
  Marketing pages may stay light if they read better that way. Say which in the PR.

**Verify**
- The visual spec runs in both themes. Attach every screen at both widths in both themes.
- An axe contrast check (WCAG AA, `@axe-core/playwright`) passes in both themes, with one
  exception: white labels on gold buttons. design-system.md accepts them on purpose (about 2.2:1),
  so exclude that pattern from the check and list it in the PR. Don't darken the gold or change
  the label color: that's Wasim's decision, not this PR's.
- No flash on a cold load in dark mode: record at 30 fps and review every frame.
- Have an Opus judge review the dark screenshots, and paste its verdict.
- Wasim gives his verdict on the PR. This PR stops for him.

## After each merge (local)

Deploy with `npm run deploy:cf` from main. Check production on the screens list, both themes after
PR 6, through Aside as Wasim. Clean up.

## Effort

About a week of agent work for PRs 1 to 5, plus 2 to 3 days for PR 6.
