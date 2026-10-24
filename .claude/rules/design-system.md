---
paths:
  - "src/components/**"
  - "src/app/**/*.tsx"
  - "src/**/*.css"
---

# Useful Apply Design System (authoritative, overrides any older spec)

The product has three visual layers. Every panel, card, and document must pick a role and stick to it.

### Tokens: roles first
UI code names the job a value does, never the palette step behind it: `bg-surface`, `text-ink`, `border-border`, `rounded-card`, `shadow-resting`, `ease-standard`. The roles live on `:root` in `src/app/globals.css` and reach Tailwind through `@theme inline`; a theme (dark mode) overrides the role variables only. The palette (`navy-*`, `cream-*`, `gold-*`, `sage-*`, `charcoal`, `warm-gray`) stays in `globals.css` as the values behind the roles. Don't use it in components.

`npm run lint` runs `scripts/check-design-tokens.mjs`. It fails on palette-named color classes (Tailwind's default palettes, `white` and `black` included), palette variables (`var(--color-navy-600)`), hex and `rgb()`/`hsl()`/`oklch()` colors (arbitrary values included), radius classes outside the roles, and gradients, in `src/components`, `src/app` and `src/lib/blog`. CV templates, exports, email templates, icons and logos, route handlers, the root error page and blog post bodies keep their own colors. Code that predates the roles is listed in `scripts/design-token-baseline.json` (a count per file and rule) while it migrates. The baseline only shrinks: after removing hits, run `node scripts/check-design-tokens.mjs --update`.

No role fits? Add one: a variable on `:root`, its `--color-*` line in `@theme inline`, and a row below. Don't reach for the palette.

### Color roles
Values are today's light theme.

| Group | Role | Value | Use for |
|-------|------|-------|---------|
| Ground | `canvas` | cream-100 `#FAF7F2` | Page canvas only: dashboard shell, every panel shell, modal backdrop fallback |
| | `surface` | cream-50 `#FEFDFB` | Everything cards live in: cards, grids, pills, inputs, state messages, wizard body, tab tracks, tracker rows, job cards, empty-state tiles |
| | `document` | `#FFFFFF` | Only printable/sendable documents: CV page, cover letter body, email body, modal inner scroll area when it holds a document. White in every theme |
| | `sunken` | cream-200 | Inset wells and tracks below the surface |
| | `surface-raised` | `#FFFFFF` | White controls on a surface: active tabs and pills, raised buttons, inputs. Not a document |
| Ink | `ink` | navy-800 | Headings and strong text |
| | `ink-body` | charcoal | Running text, labels, form values |
| | `ink-muted` | warm-gray | Secondary text, hints, meta |
| | `ink-faint` | warm-gray at 70% | Tertiary text, placeholders |
| | `ink-inverse` | `#FFFFFF` | Text on dark navy panels |
| | `ink-inverse-muted` | navy-200 | Secondary text on dark navy panels |
| | `ink-accent` | gold-600 | Gold text and icons on light ground |
| Brand | `brand` | navy-600 | Navy CTA fill, brand-colored text and links |
| | `brand-strong` | navy-700 | Navy CTA hover, link hover |
| | `brand-soft` | navy-50 | Light navy tint behind chips and selections |
| | `brand-ink` | `#FFFFFF` | Text and icons on `brand` |
| Accent | `accent` | gold-400 | Gold CTA fill, accent borders and rings |
| | `accent-strong` | gold-500 | Gold CTA hover |
| | `accent-soft` | gold-50 | Badge, chip and status-tile tint |
| | `accent-soft-strong` | gold-100 | The stronger tint |
| | `accent-soft-ink` | gold-700 | Dark text on the gold tints |
| | `accent-ink` | `#FFFFFF` | Text and icons on `accent` |
| Lines | `border` (class `border-border`) | cream-200 | Borders on surfaces |
| | `border-strong` (`border-border-strong`) | cream-300 | Dividers only |
| | `border-accent` (`border-border-accent`) | gold-300 | Gold outlines. `border-accent` the class is the `accent` role, gold-400 |
| | `border-accent-soft` (`border-border-accent-soft`) | gold-200 | Faint gold outlines |
| | `border-brand-soft` (`border-border-brand-soft`) | navy-200 | Navy outlines, hover borders |
| | `border-focus` (`border-border-focus`) | navy-500 | Input borders on focus |
| Status | `success`, `success-strong`, `success-soft` | sage-600, sage-700, sage-50 | Done, saved, matched |
| | `warning`, `warning-soft` | yellow-600, yellow-50 | Partial, needs a look |
| | `danger`, `danger-strong`, `danger-muted`, `danger-soft`, `border-danger` (`border-border-danger`) | red-600, red-700, red-400, red-50, red-200 | Errors and destructive actions |
| Focus | `focus-ring` | navy-600 | Focus outlines and rings |
| Inverse | `surface-inverse` | navy-800 | Dark navy panels (pricing card, code blocks) |
| | `surface-inverse-strong` | navy-900 | The darkest band (landing), scrims |
| | `surface-inverse-raised` | navy-700 | Navy toasts and raised dark tiles |
| | `border-inverse`, `border-inverse-raised` | navy-700, navy-600 | Hairlines on those panels |
| Shell, dashboard and chat extras | `brand-soft-strong`, `border-brand-faint` | navy-100, navy-100 | Stronger navy tint fill, faint navy hairline |
| | `brand-deep` | navy-900 | Brand text on hover, one step past `brand-strong` |
| | `focus-ring-soft` | navy-400 | Soft focus ring (use with an opacity) |
| | `accent-muted` | gold-300 | Gold fill lighter than `accent` (drag-handle hover) |
| | `ink-muted-strong` | gray-600 | Hover of an `ink-muted` fill |
| | `ink-inverse-soft`, `ink-inverse-dim`, `border-inverse-soft` | cream-50, cream-200, cream-200 | Text and hairlines on navy toasts |
| | `danger-bright`, `danger-soft-strong` | red-500, red-100 | Error icons, stronger red tint |
| | `status-done`, `status-partial`, `status-draft` | emerald-400, amber-400, gray-300 | Status dots in chat history |
| | `done-soft`, `border-done-soft`, `done-ink` | emerald-50, emerald-100, emerald-700 | "Done" banner in agent progress |
| | `scrim` | black | Modal backdrops (use with an opacity) |
| | `info-soft`, `border-info-soft`, `info-ink` | violet-50, violet-100, violet-700 | In-progress notes (agent "reflecting" banner) |
| | `ink-error` | rose-700 | Inline error text in lists and search |
| Canvas and workspace extras | `brand-mid`, `brand-muted` | navy-500, navy-400 | Brand-colored icons and bullets, input hover and focus borders |
| | `border-brand` | navy-300 | Dashed add buttons and edit-field outlines |
| | `border-inverse-mid` | navy-500 | Hairline on a dark panel |
| | `ink-inverse-tint` | navy-100 | Mono text on a dark panel |
| | `ink-ghost` | cream-400 | Empty-state icons, strikethrough decoration |
| | `border-stronger` | cream-400 | Dashed and drop-zone borders |
| | `accent-deep` | gold-600 | Gold save button hover |
| | `success-muted`, `border-success`, `border-success-soft` | sage-500, sage-300, sage-200 | Strong-match dot, ATS ring, match pill border |
| Marketing | `ink-inverse-tint`, `ink-inverse-faint` | navy-100, navy-300 | Softer and fainter text on dark navy bands |
| | `ink-strong` | navy-900 | Display figures on light ground |
| | `ink-accent-on-inverse` | gold-300 | Gold text on dark navy |
| | `border-subtle` | cream-100 | Faint row dividers |
| | `positive`, `positive-soft` | green-600, green-50 | Check marks and matched-cell tint in comparison tables |
| | `danger-on-inverse` | red-300 | Error text on dark navy |
| | `link-inverse`, `link-inverse-hover` | teal-400, teal-300 | Links on the dark footer |
| | `tag-blue-*`, `tag-purple-*`, `tag-rose-*`, `tag-orange-*`, `tag-green-*` (`-soft`, `-ink`, `-line`) | 50, 700, 200 of that hue | Blog category chips and comparison winner tiles |
| App pages | `ink-strong` | navy-900 | Page and pane titles that need the darkest ink |
| | `ink-inverse-warm` | cream-100 | Text in code blocks on `surface-inverse` |
| | `focus-halo` | navy-100 | Soft focus halo around inputs |
| | `border-danger-strong` | red-300 | Border of an input in error |
| | `sunken-strong` | cream-300 | Off state of a toggle track |
| | `status-bad` | rose-600 | Failing status dot (admin) |
| | `chart-line` | navy-300 | Chart series line (admin) |

Utilities follow Tailwind's naming, utility then role: `bg-surface`, `text-ink-muted`, `border-border`, `border-border-strong`, `ring-focus-ring`, `bg-accent/10`. Roles whose names start with `border-` take a second `border-` as a border class, so `border-gold-300` becomes `border-border-accent`, while `border-accent` is gold-400. Opacity modifiers work on every role.

Rules:
- **No gradients on canvas or surface layers.** No `bg-gradient-to-b` shells, no custom `bg-[radial-gradient(...)]` canvases. Gradients are reserved for CTAs (gold/navy buttons), nothing else.
- **No translucent whites over cream.** `bg-document/85`, `bg-white/90` and the like on the canvas create subtle tint shifts the eye can feel but not name. Use solid `bg-surface` or solid `bg-document`: decide which role the surface is playing.
- **Borders on surfaces:** `border-border`. `border-border-strong` (cream-300) and anything darker read as dingy; keep them for dividers.
- **Avoid `border-strong` and darker creams on large fills.** They read as aged paper / dingy.
- **Scrollbars are overlay-style: invisible at rest, white when revealed, never navy and never gold.** The thumb is transparent until the pointer is over the scroller or the scroller is scrolling (`ScrollbarReveal` stamps `data-scrolling`), then soft white `rgba(255,255,255,0.75)` with a faint navy inset hairline so it stays findable on white documents, and solid `#FFFFFF` when the thumb itself is hovered or grabbed. Transparent track, 12px wide with a 2px transparent border so the thumb reads as 8px (`globals.css`). Dark surfaces take `.scrollbar-on-dark`: same behavior, no hairline, `rgba(255,255,255,0.45)` reveal. Firefox has no per-state scrollbar colors, so it keeps an always-visible soft white thin bar.

### Typography
- **One family everywhere in the app UI: Inter** (self-hosted via `next/font` in `layout.tsx`, wired to `--font-sans` in `globals.css`). Headings, body, labels, buttons, chips, form fields all use it. The old Georgia/Arial split is retired; do NOT reintroduce `font-serif` anywhere in the app or landing.
- **Hierarchy comes from size and weight, not family.** Page/panel titles: `font-semibold` at the existing size scale. Body and labels: `font-normal` / `font-medium`.
- **`font-semibold` not `font-bold`** on headings.
- **Exemptions:** `src/components/cv-templates/**` and the exported PDF/DOCX keep Arial + Georgia in spirit: the PDF and the canvas use Arimo + Gelasio (their metric-compatible OFL twins, self-hosted), and the DOCX uses Arial + Georgia (ATS-safe fonts in the applicant's own document). Email templates keep their inline fonts. The brand wordmark keeps Plus Jakarta Sans.

### Radius roles (3 + 1)
Pick one role per element. Side variants work too (`rounded-t-card`, `rounded-l-control`). `rounded-none` is allowed; every other radius class is deprecated.
| Role | Class | Value | Use for |
|------|-------|-------|---------|
| **Pill** | `rounded-pill` | fully round (`rounded-full`) | Chips, status pills, icon buttons, avatar rings |
| **Control** | `rounded-control` | 0.5rem (`rounded-lg`) | Inputs, dropdowns, small buttons, tooltips |
| **Card** | `rounded-card` | 1rem (`rounded-2xl`) | Cards, panels, grids, wizards, preview tiles |
| **Modal** *(reserved)* | `rounded-modal` | 24px | Full-screen / centered modals only |

Do NOT use: `rounded-md`, `rounded-xl`, `rounded-3xl`, `rounded-[14px]`, `rounded-[16px]`, `rounded-[18px]`, `rounded-[20px]`, `rounded-[22px]`, `rounded-[28px]`, `rounded-[30px]`, `rounded-[32px]`. Collapse all of those to the nearest role above.

### CTA treatments (one each — no gradients)
| CTA | Class | Use |
|-----|-------|-----|
| **Primary (Gold)** | `bg-accent hover:bg-accent-strong text-accent-ink` | Main action per surface ("Apply with Useful Apply", "Start my daily feed", "Upgrade to Plus") |
| **Primary (Navy)** | `bg-brand hover:bg-brand-strong text-brand-ink` | Secondary primary ("Sign up", "Save changes", sidebar highlights) |

**Button label colour is always white** (`text-accent-ink`, `text-brand-ink`) on any solid brand fill, gold or navy. This is a deliberate brand-consistency decision: a screen mixing white-on-navy with dark-on-gold reads as inconsistent. Never put `text-ink`, `text-ink-body` or any dark role on `bg-accent` / `bg-accent-strong`. The same applies to icons inside those buttons.

Known tradeoff: white on `accent` (gold-400, `#D4A853`) measures ~2.2:1, below the WCAG AA 4.5:1 threshold for normal text. Consistency was chosen over the contrast ratio here. If we ever want white labels that also pass AA, the fill has to darken to roughly gold-700 (`#825E1C`, ~5.9:1). That's a brand decision, not something to change per-component. Do not "fix" individual buttons back to dark text.

The light gold tints (`bg-accent-soft`, `bg-accent-soft-strong`) are a different role: they are badges, chips and status tiles, not CTAs, and they keep dark text (`text-accent-soft-ink`, `text-ink-body`). White on a light tint is unreadable.

Do NOT use: gradient CTAs (`bg-gradient-to-r` from gold or navy), `bg-accent-strong` / `bg-brand-strong` as default base. Gradients on CTAs read as AI-slop; flat brand colors read as confident.

### Shadow roles (3 values)
| Depth | Class | Value | Use |
|-------|-------|-------|-----|
| **Resting** | `shadow-resting` | `--shadow-sm` | Cards, pills, tab tracks: everything that sits on the canvas |
| **Elevated** | `shadow-elevated` | `--shadow-md` | Hover state on cards, dropdowns, popovers |
| **Floating** | `shadow-floating` | `--shadow-lg` | Modals, full-preview overlays, toasts |

Do NOT invent bespoke drop-shadow strings like `shadow-[0_24px_60px_-20px_rgba(30,58,95,0.35)]`. If `shadow-floating` isn't dramatic enough for a modal, use `shadow-xl` (last resort). Never `shadow-2xl`. Shadow color modifiers (`shadow-gold-200`) don't apply to the role shadows.

### Motion
- `transition-colors duration-(--duration-base)` default (200ms). `--duration-fast` is 150ms.
- `ease-standard` (decelerating out-quart) for structure; `ease-pop` (spring) for pop moments only: dialogs, ticks, badges.
- Elevation lift (`-translate-y-0.5 hover:shadow-elevated`) reserved for elevated CTAs only, not on every card.

### Iconography
- Lucide-react only. Sizes: `w-3.5` (chrome), `w-4` (inline text), `w-5` (headers), `w-6` (modal close, empty-state tiles).

**When in doubt, follow this before touching any visual code.**
